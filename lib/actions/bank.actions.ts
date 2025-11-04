"use server";

import {
  CountryCode,
  TransactionsSyncRequest,

} from "plaid";

import { plaidClient } from "../plaid";
import { parseStringify, encryptId } from "../utils";

import { getTransactionsByBankId } from "./transaction.actions";
import { createAdminClient } from "../appwrite";
import { Query } from "node-appwrite";
import { AccountTypes, Bank, Transaction } from "@/types";

const {
  APPWRITE_DATABASE_ID: DATABASE_ID,
  APPWRITE_BANK_COLLECTION_ID: BANK_COLLECTION_ID,
} = process.env;

// Local helper to get a bank document by Appwrite document ID (user.actions doesn't export getBank)
const getBank = async ({ documentId }: { documentId: string }) => {
  try {
    const { database } = await createAdminClient();
    const bank = await database.getDocument(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      documentId
    );
    return bank;
  } catch (error) {
    console.error("Error fetching bank:", error);
    return null;
  }
};

// ------------ Refresh access token when expired --------------
// const refreshAccessToken = async (bankId: string, accessToken: string): Promise<string | null> => {
//   try {
//     // Try to refresh the access token with Plaid
//     console.log(`Attempting to refresh access token for bank ${bankId}`);
    
//     // For sandbox testing, we might need to use the Link Update mode
//     // In production, you would implement proper token refresh logic here
//     console.warn(`Access token for bank ${bankId} needs to be refreshed. User should reconnect their bank.`);
    
//     return null; // Return null to indicate refresh failed, user needs to reconnect
//   } catch (error) {
//     console.error(`Failed to refresh access token for bank ${bankId}:`, error);
//     return null;
//   }
// };

// ------------ Update bank access token in database --------------
// const updateBankAccessToken = async (bankId: string, newAccessToken: string): Promise<boolean> => {
//   try {
//     const { database } = await createAdminClient();
    
//     await database.updateDocument(
//       DATABASE_ID!,
//       BANK_COLLECTION_ID!,
//       bankId,
//       {
//         accessToken: newAccessToken,
//       }
//     );
//       console.log(`Successfully updated access token for bank ${bankId}`);
//     return true;
//   } catch (error) {
//     console.error(`Error updating access token for bank ${bankId}:`, error);
//     return false;
//   }
// };

// ------------ Mark bank as needing re-authentication --------------
// const markBankAsExpired = async (bankId: string): Promise<boolean> => {
//   try {
//     // Instead of updating status (which doesn't exist), we could add a lastChecked field
//     // For now, we'll just log that the bank needs attention
//     console.warn(`Bank ${bankId} marked as needing re-authentication`);
//     return true;
//   } catch (error) {
//     console.error(`Error marking bank ${bankId} as expired:`, error);
//     return false;
//   }
// };

// ------------ Refresh access token if needed --------------
const refreshAccessTokenIfNeeded = async (bank: Record<string, unknown>) => {
  try {
    // Try to get REAL accounts data from Plaid API
    console.log(`Fetching REAL account data for bank ${bank.$id} from Plaid API...`);
    
    const accountsResponse = await plaidClient.accountsGet({
      access_token: bank.accessToken as string,
    });
    
    console.log(`Successfully fetched REAL data for bank ${bank.$id} from Plaid`);
    console.log(`Account details:`, {
      accountId: accountsResponse.data.accounts[0]?.account_id,
      name: accountsResponse.data.accounts[0]?.name,
      balance: accountsResponse.data.accounts[0]?.balances?.current
    });
    
    return accountsResponse;
  } catch (error) {
    const errorObj = error as Record<string, unknown>;
    const response = errorObj?.response as Record<string, unknown>;
    const responseData = response?.data as Record<string, unknown>;
    const errorCode = responseData?.error_code || errorObj?.error_code;
    const status = response?.status || errorObj?.status;
    const message = (error as Error).message;
    
    console.error(`Failed to fetch REAL data from Plaid for bank ${bank.$id}:`, errorCode || message);
    
    // If token is expired, invalid, or requires re-authentication
    if (status === 400 || 
        errorCode === 'INVALID_ACCESS_TOKEN' || 
        errorCode === 'ITEM_LOGIN_REQUIRED' ||
        errorCode === 'ACCESS_NOT_GRANTED' ||
        errorCode === 'ITEM_NO_ERROR' ||
        message?.includes('400')) {
      console.warn(`Bank ${bank.$id} requires re-authentication - Status: ${status}, Error: ${errorCode}`);
      throw new Error('TOKEN_REFRESH_REQUIRED');
    }
    
    // For other errors, re-throw
    throw error;
  }
};

// ------------ Get banks for a user (local replacement for missing export) --------------
export const getBanks = async ({ userId }: { userId: string }) => {
  try {
    const { database } = await createAdminClient();

    const response = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal("userId", [userId])]
    );

    // Add debug logging
    console.log(`Found ${response?.documents?.length || 0} banks for user ${userId}`);
    response?.documents?.forEach((bank: Record<string, unknown>) => {
      console.log(`Bank ${bank.$id}: accessToken exists = ${!!bank.accessToken}, length = ${(bank.accessToken as string)?.length || 0}`);
    });

    // Appwrite returns an object with `documents`
    return response?.documents ?? [];
  } catch (error) {
    console.error("Error fetching banks for user:", error);
    return [];
  }
};

// ------------ Get multiple bank accounts --------------
export const getAccounts = async ({ userId }: { userId: string }) => {
  try {
    const banks = await getBanks({ userId });

    if (!banks || banks.length === 0) {
      return parseStringify({ data: [], totalBanks: 0, totalCurrentBalance: 0 });
    }

    const accounts = await Promise.all(
      banks.map(async (bank: Record<string, unknown>) => {
        const b = bank as unknown as Bank;
        try {
          const accountsResponse = await refreshAccessTokenIfNeeded(bank);

          // Check if accounts array exists and has data
          if (!accountsResponse.data.accounts || accountsResponse.data.accounts.length === 0) {
            console.warn(`No accounts found for bank ${bank.$id} - token may need refresh`);
            // Return a placeholder account instead of throwing
            return {
              id: b.$id,
              availableBalance: 0,
              currentBalance: 0,
              institutionId: '',
              name: 'Account Unavailable',
              officialName: '',
              mask: '0000',
              type: 'checking',
              subtype: '',
              appwriteItemId: b.$id,
              shareableId: b.shareableId || b.$id,
              needsReauth: true
            };
          }

          const accountData = accountsResponse.data.accounts[0];
            // Get institution info to get real bank name
          const institution = await getInstitution({
            institutionId: accountsResponse.data.item.institution_id || '',
          }).catch(() => null);

          // Use institution name instead of account name for better display
          const displayName = institution?.name || accountData?.name || 'My Account';

          return {
            id: accountData?.account_id || b.$id,
            availableBalance: accountData?.balances?.available ?? 0,
            currentBalance: accountData?.balances?.current ?? 0,
            institutionId: institution?.institution_id || '',
            name: displayName, // Use institution name or account name
            officialName: accountData?.official_name || displayName,
            mask: accountData?.mask || '0000',
            type: accountData?.type || 'checking',
            subtype: accountData?.subtype || 'checking',
            appwriteItemId: b.$id,
            shareableId: b.shareableId || b.$id,
            needsReauth: false
          };
        } catch (error) {
          const errorObj = error as Record<string, unknown>;
          console.error(`Error fetching account for bank ${b.$id}:`, error);
          
          // Check if this is a token expiration issue
          const needsReauth = (error as Error).message === 'TOKEN_REFRESH_REQUIRED' || 
                             errorObj.error_code === 'INVALID_ACCESS_TOKEN' ||
                             errorObj.error_code === 'ITEM_LOGIN_REQUIRED';
          
          return {
            id: b.$id,
            availableBalance: 0,
            currentBalance: 0,
            institutionId: '',
            name: needsReauth ? 'Bank Needs Reconnection' : 'Account Unavailable',
            officialName: '',
            mask: '0000',
            type: 'checking',
            subtype: '',
            appwriteItemId: b.$id,
            shareableId: b.shareableId || b.$id,
            needsReauth: needsReauth
          };
        }
      })
    );

    const validAccounts = accounts.filter(account => !account.needsReauth);
    const totalBanks = validAccounts.length;
    const totalCurrentBalance = validAccounts.reduce(
      (total, account) => total + account.currentBalance,
      0
    );

    return parseStringify({ 
      data: accounts, 
      totalBanks, 
      totalCurrentBalance 
    });
  } catch (error) {
    console.error("An error occurred while getting the accounts:", error);
    return parseStringify({ 
      data: [], 
      totalBanks: 0, 
      totalCurrentBalance: 0 
    });
  }
};

// ------------ Get one bank account --------------
export const getAccount = async ({ appwriteItemId }: { appwriteItemId: string }) => {
  try {
    const bank = await getBank({ documentId: appwriteItemId });

    if (!bank) {
      throw new Error(`Bank with ID ${appwriteItemId} not found.`);
    }
    const accountsResponse = await refreshAccessTokenIfNeeded(bank);

    // Check if accounts array exists and has data
    if (!accountsResponse.data.accounts || accountsResponse.data.accounts.length === 0) {
      console.warn(`No accounts found for bank ${bank.$id}`);
      return parseStringify({
        data: {
          id: bank.$id,
          availableBalance: 0,
          currentBalance: 0,
          institutionId: '',
          name: 'Account Unavailable',
          officialName: '',
          mask: '0000',
          type: 'checking' as AccountTypes,
          subtype: '',
          appwriteItemId: bank.$id,
          shareableId: encryptId(bank.$id),
          needsReauth: true
        }
      });
    }

    const accountData = accountsResponse.data.accounts[0];
    
    if (!accountData) {
      console.error('No account data found for bank:', bank.$id);
      return parseStringify({
        data: {
          id: bank.$id,
          availableBalance: 0,
          currentBalance: 0,
          institutionId: '',
          name: 'Account Unavailable',
          officialName: '',
          mask: '',
          type: 'unknown',
          subtype: '',
          appwriteItemId: bank.$id,
          shareableId: bank.shareableId,
          needsReauth: true
        },
        transactions: []
      });
    }

    const transferTransactionsData = await getTransactionsByBankId({
      bankId: bank.$id,
    });

    // Defensive check for attribute existence: ensure 'senderBankId' exists in your Appwrite schema.
    const transferTransactions =
      transferTransactionsData?.documents?.map((transferData: Transaction) => ({
        id: transferData.$id,
        name: transferData.name!,
        amount: transferData.amount!,
        date: transferData.$createdAt,
        paymentChannel: transferData.channel,
        category: transferData.category,
        type: transferData.senderBankId === bank.$id ? "debit" : "credit",
      })) || [];    // Get institution info for real bank name
    const institution = await getInstitution({
      institutionId: accountsResponse.data.item.institution_id!,
    });

    // Use institution name for better display
    const displayName = institution?.name || accountData.name || 'My Account';

    let transactions: Array<Record<string, unknown>> = [];
    try {
      const transactionResponse = await getTransactions({
        accessToken: bank.accessToken,
      });
      transactions = transactionResponse || [];
    } catch (txError) {
      console.error("Error fetching transactions for bank:", txError);
      // Continue without transactions rather than failing
      transactions = [];
    }
    
    const account = {
      id: accountData.account_id || bank.$id,
      availableBalance: accountData.balances?.available ?? 0,
      currentBalance: accountData.balances?.current ?? 0,
      institutionId: institution?.institution_id || '',
      name: displayName, // Use institution name instead of generic account name
      officialName: accountData.official_name || displayName,
      mask: accountData.mask || "0000",
      type: accountData.type || 'checking',
      subtype: accountData.subtype || 'checking',
      appwriteItemId: bank.$id,
      shareableId: bank.shareableId || bank.$id,
      needsReauth: false
    };

    // Sort transactions with most recent first
    const allTransactions = [...(transactions || []), ...transferTransactions].sort(
      (a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime()
    );

    return parseStringify({
      data: account,
      transactions: allTransactions,
    });
  } catch (error) {
    console.error("An error occurred while getting the account:", error);
    // Return error response instead of throwing
    // Note: updateBankStatus removed as 'status' field doesn't exist in database schema
    return parseStringify({
      data: null,
      transactions: [],
      error: 'Failed to fetch account details. Please reconnect your bank.'
    });
  }
};

// ------------ Get institution info --------------
export const getInstitution = async ({ institutionId }: { institutionId: string }) => {
  try {
    console.log(`Fetching REAL institution data for ${institutionId} from Plaid API...`);
    
    const institutionResponse = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: ["US"] as CountryCode[],
    });

    const institution = institutionResponse.data.institution;
    console.log(`Successfully fetched REAL institution: ${institution.name}`);
    return parseStringify(institution);
  } catch (error) {
    console.error("Error fetching REAL institution data from Plaid:", error);
    throw error;
  }
};

// ------------ Get transactions with robust cursor handling and error management --------------
export const getTransactions = async ({ accessToken }: { accessToken: string }) => {
  let hasMore = true;
  let cursor: string | undefined = undefined;
  let transactions: Array<Record<string, unknown>> = [];

  try {
    console.log('Fetching REAL transactions from Plaid API...');
    
    while (hasMore) {
      const request: TransactionsSyncRequest = { access_token: accessToken };
      if (cursor) request.cursor = cursor;

      const response = await plaidClient.transactionsSync(request);
      const data = response.data;

      if (!data?.added) {
        throw new Error("Plaid response missing `added` field");
      }

      transactions = transactions.concat(
        data.added.map((transaction) => ({
          id: transaction.transaction_id,
          name: transaction.name,
          paymentChannel: transaction.payment_channel,
          type: transaction.payment_channel,
          accountId: transaction.account_id,
          amount: transaction.amount,
          pending: transaction.pending,
          category: transaction.category ? transaction.category[0] : "",
          date: transaction.date,
          image: transaction.logo_url,
        }))
      );

      cursor = data.next_cursor;
      hasMore = data.has_more;

      if (!cursor || cursor === "") {
        hasMore = false;
      }
    }

    console.log(`Successfully fetched ${transactions.length} REAL transactions from Plaid`);
    return parseStringify(transactions);
  } catch (error) {
    const errorObj = error as Record<string, unknown>;
    const response = errorObj?.response as Record<string, unknown>;
    const responseData = response?.data as Record<string, unknown>;
    
    console.error("Plaid transactionsSync error:", {
      message: (error as Error).message,
      status: response?.status,
      data: responseData,
    });

    if (
      responseData?.error_code === "INVALID_CURSOR" &&
      cursor !== undefined
    ) {
      try {
        console.warn("Retrying getTransactions without cursor due to INVALID_CURSOR");
        const response = await plaidClient.transactionsSync({ access_token: accessToken });
        const data = response.data;

        const retryTransactions = data.added.map((transaction) => ({
          id: transaction.transaction_id,
          name: transaction.name,
          paymentChannel: transaction.payment_channel,
          type: transaction.payment_channel,
          accountId: transaction.account_id,
          amount: transaction.amount,
          pending: transaction.pending,
          category: transaction.category ? transaction.category[0] : "",
          date: transaction.date,
          image: transaction.logo_url,
        }));

        console.log(`Retry successful: fetched ${retryTransactions.length} REAL transactions`);
        return parseStringify(retryTransactions);
      } catch (retryError) {
        console.error("Retry attempt failed:", retryError);
        throw retryError;
      }
    }

    throw error;
  }
};

// ------------ Remove expired bank connections --------------
export const removeExpiredBank = async (bankId: string, userId: string) => {
  try {
    const { database } = await createAdminClient();
    
    await database.deleteDocument(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      bankId
    );
    
    console.log(`Removed expired bank ${bankId} for user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error(`Error removing expired bank ${bankId}:`, error);
    return { success: false, error };
  }
};