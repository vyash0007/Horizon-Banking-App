"use server";

import {
  ACHClass,
  CountryCode,
  TransferAuthorizationCreateRequest,
  TransferCreateRequest,
  TransferNetwork,
  TransferType,
} from "plaid";

import { plaidClient } from "../plaid";
import { parseStringify } from "../utils";

import { getTransactionsByBankId } from "./transaction.actions";
import { getBanks, getBank } from "./user.actions";

// ------------ Get multiple bank accounts --------------
export const getAccounts = async ({ userId }: { userId: string }) => {
  try {
    const banks = await getBanks({ userId });

    if (!banks || banks.length === 0) {
      return parseStringify({ data: [], totalBanks: 0, totalCurrentBalance: 0 });
    }

    const accounts = await Promise.all(
      banks.map(async (bank: Bank) => {
        const accountsResponse = await plaidClient.accountsGet({
          access_token: bank.accessToken,
        });

        const accountData = accountsResponse.data.accounts[0];

        const institution = await getInstitution({
          institutionId: accountsResponse.data.item.institution_id!,
        });

        return {
          id: accountData.account_id,
          availableBalance: accountData.balances.available ?? 0,
          currentBalance: accountData.balances.current ?? 0,
          institutionId: institution.institution_id,
          name: accountData.name,
          officialName: accountData.official_name,
          mask: accountData.mask ?? "",
          type: accountData.type as string,
          subtype: accountData.subtype! as string,
          appwriteItemId: bank.$id,
          sharaebleId: bank.shareableId,
        };
      })
    );

    const totalBanks = accounts.length;
    const totalCurrentBalance = accounts.reduce(
      (total, account) => total + account.currentBalance,
      0
    );

    return parseStringify({ data: accounts, totalBanks, totalCurrentBalance });
  } catch (error) {
    console.error("An error occurred while getting the accounts:", error);
    throw error;
  }
};

// ------------ Get one bank account --------------
export const getAccount = async ({ appwriteItemId }: { appwriteItemId: string }) => {
  try {
    const bank = await getBank({ documentId: appwriteItemId });

    if (!bank) {
      throw new Error(`Bank with ID ${appwriteItemId} not found.`);
    }

    const accountsResponse = await plaidClient.accountsGet({
      access_token: bank.accessToken,
    });
    const accountData = accountsResponse.data.accounts[0];

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
      })) || [];

    const institution = await getInstitution({
      institutionId: accountsResponse.data.item.institution_id!,
    });

    const transactions = await getTransactions({
      accessToken: bank.accessToken,
    });

    const account = {
      id: accountData.account_id,
      availableBalance: accountData.balances.available ?? 0,
      currentBalance: accountData.balances.current ?? 0,
      institutionId: institution.institution_id,
      name: accountData.name,
      officialName: accountData.official_name,
      mask: accountData.mask ?? "",
      type: accountData.type as string,
      subtype: accountData.subtype! as string,
      appwriteItemId: bank.$id,
    };

    // Sort transactions with most recent first
    const allTransactions = [...(transactions || []), ...transferTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return parseStringify({
      data: account,
      transactions: allTransactions,
    });
  } catch (error) {
    console.error("An error occurred while getting the account:", error);
    throw error;
  }
};

// ------------ Get institution info --------------
export const getInstitution = async ({ institutionId }: { institutionId: string }) => {
  try {
    const institutionResponse = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: ["US"] as CountryCode[],
    });

    const institution = institutionResponse.data.institution;
    return parseStringify(institution);
  } catch (error) {
    console.error("An error occurred while getting the institution:", error);
    throw error;
  }
};

// ------------ Get transactions with robust cursor handling and error management --------------
export const getTransactions = async ({ accessToken }: { accessToken: string }) => {
  let hasMore = true;
  let cursor: string | undefined = undefined;
  let transactions: any[] = [];

  try {
    while (hasMore) {
      const request: any = { access_token: accessToken };
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

    return parseStringify(transactions);
  } catch (error: any) {
    console.error("Plaid transactionsSync error:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    if (
      error.response?.data?.error_code === "INVALID_CURSOR" &&
      cursor !== undefined
    ) {
      try {
        console.warn("Retrying getTransactions without cursor due to INVALID_CURSOR");
        const response = await plaidClient.transactionsSync({ access_token: accessToken });
        const data = response.data;

        return parseStringify(
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
      } catch (retryError) {
        console.error("Retry attempt failed:", retryError);
        throw retryError;
      }
    }

    throw error;
  }
};
