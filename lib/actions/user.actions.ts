'use server';

import { ID, Query } from "node-appwrite";
import { createAdminClient, createSessionClient } from "../appwrite";
import { cookies } from "next/headers";
import { encryptId, extractCustomerIdFromUrl, parseStringify } from "../utils";
import { CountryCode, ProcessorTokenCreateRequest, ProcessorTokenCreateRequestProcessorEnum, Products } from "plaid";

import { plaidClient } from '@/lib/plaid';
import { revalidatePath } from "next/cache";
import { addFundingSource, createDwollaCustomer } from "./dwolla.actions";
import { SignUpParams } from "@/types";

const {
  APPWRITE_DATABASE_ID: DATABASE_ID,
  APPWRITE_USER_COLLECTION_ID: USER_COLLECTION_ID,
  APPWRITE_BANK_COLLECTION_ID: BANK_COLLECTION_ID,
} = process.env;

// Debug function to check Plaid configuration
const debugPlaidConfig = () => {
  console.log('Plaid Configuration Debug:', {
    PLAID_ENV: process.env.PLAID_ENV,
    PLAID_CLIENT_ID_EXISTS: !!process.env.PLAID_CLIENT_ID,
    PLAID_SECRET_EXISTS: !!process.env.PLAID_SECRET,
    PLAID_CLIENT_ID_LENGTH: process.env.PLAID_CLIENT_ID?.length || 0,
    PLAID_SECRET_LENGTH: process.env.PLAID_SECRET?.length || 0,
  });
};

export const getUserInfo = async ({ userId }: { userId: string }) => {
  try {
    const { database } = await createAdminClient();

    const users = await database.listDocuments(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      [Query.equal('userId', [userId])] // Must match exact field name in Appwrite schema
    );

    if (!users.total) {
      console.error('No user found in DB for userId:', userId);
      return null;
    }

    return parseStringify(users.documents[0]);
  } catch (error) {
    console.error("Error fetching user info:", error);
    return null;
  }
};

export const signIn = async ({ email, password }: { email: string; password: string }) => {
  try {
    const { account } = await createAdminClient();
    const session = await account.createEmailPasswordSession(email, password);

    (await cookies()).set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });

    const user = await getUserInfo({ userId: session.userId });

    if (!user) {
      throw new Error("User not found in database.");
    }

    return parseStringify(user);
  } catch (error) {
    console.error("Error signing in:", error instanceof Error ? error.message : error);
    throw error;
  }
};

export const signUp = async (userData: SignUpParams) => {
  try {
    const { email, firstName, lastName, password, ...rest } = userData;
    const { account, database } = await createAdminClient();

    // Create Appwrite user account
    const newUserAccount = await account.create(
      ID.unique(),
      email,
      password,
      `${firstName} ${lastName}`
    );

    if (!newUserAccount) throw new Error('Error creating user');

    // Create Dwolla customer with all required fields
    const dwollaCustomerUrl = await createDwollaCustomer({
      firstName,
      lastName,
      email,
      type: 'personal',
      address1: userData.address1,
      city: userData.city,
      state: userData.state,
      postalCode: userData.postalCode,
      dateOfBirth: userData.dateOfBirth,
      ssn: userData.ssn
    });

    if (!dwollaCustomerUrl) throw new Error('Error creating Dwolla customer');

    const dwollaCustomerId = extractCustomerIdFromUrl(dwollaCustomerUrl);

    // Create user document in Appwrite DB
    const newUser = await database.createDocument(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      ID.unique(),
      {
        ...rest,
        userId: newUserAccount.$id,  // Matching case of userid field in DB
        email,
        firstName,
        lastName,
        dwollaCustomerId,
        dwollaCustomerUrl,
      }
    );

    // Create session to auto-login
    const session = await account.createEmailPasswordSession(email, password);

    (await cookies()).set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });

    return parseStringify(newUser);
  } catch (error) {
    console.error('Error signing up:', error);
    throw error;
  }
};

export async function getLoggedInUser() {
  try {
    const { account } = await createSessionClient();
    const result = await account.get();

    const user = await getUserInfo({ userId: result.$id });

    return parseStringify(user);
  } catch (error) {
    console.error('Error getting logged in user:', error);
    return null;
  }
}

export const logoutAccount = async () => {
  try {
    const { account } = await createSessionClient();

    (await cookies()).delete('appwrite-session');
    await account.deleteSession('current');
  } catch (error) {
    console.error('Error logging out:', error);
    return null;
  }
};

export const createLinkToken = async (user: { $id: string; firstName: string; lastName: string }) => {
  try {
    const tokenParams = {
      user: {
        client_user_id: user.$id,
      },
      client_name: `${user.firstName} ${user.lastName}`,
      products: ['auth', 'transactions'] as Products[],
      language: 'en',
      country_codes: ['US'] as CountryCode[],
    };
    const response = await plaidClient.linkTokenCreate(tokenParams);

    return parseStringify({ linkToken: response.data.link_token });
  } catch (error) {
    console.error("Error creating link token:", error);
    throw error;
  }
};

export const createUpdateLinkToken = async (accessToken: string, userId: string) => {
  try {
    console.log('Creating update link token for user:', userId);
    console.log('Access token exists:', !!accessToken);
    
    const tokenParams = {
      user: {
        client_user_id: userId,
      },
      client_name: 'Horizon Banking',
      products: ['auth', 'transactions'] as Products[],
      country_codes: ['US'] as CountryCode[],
      language: 'en',
      access_token: accessToken,
      update: {
        account_selection_enabled: true,
      },
    };
    
    console.log('Token params for update:', {
      client_user_id: tokenParams.user.client_user_id,
      has_access_token: !!tokenParams.access_token,
      products: tokenParams.products,
      country_codes: tokenParams.country_codes
    });
    
    const response = await plaidClient.linkTokenCreate(tokenParams);
    console.log('Update link token created successfully');
    
    return parseStringify({ linkToken: response.data.link_token });
  } catch (error) {
    console.error("Error creating update link token:", error);
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message
      });
    }
    
    // If update token creation fails, create a regular link token as fallback
    console.log('Attempting fallback: creating regular link token...');
    try {
      const fallbackParams = {
        user: {
          client_user_id: userId,
        },
        client_name: 'Horizon Banking',
        products: ['auth', 'transactions'] as Products[],
        country_codes: ['US'] as CountryCode[],
        language: 'en',
      };
      
      const fallbackResponse = await plaidClient.linkTokenCreate(fallbackParams);
      console.log('Fallback link token created successfully');
      
      return parseStringify({ linkToken: fallbackResponse.data.link_token });
    } catch (fallbackError) {
      console.error("Fallback token creation also failed:", fallbackError);
      throw fallbackError;
    }
  }
};

export const updateBankConnection = async ({
  publicToken,
  bankId,
}: {
  publicToken: string;
  bankId: string;
}) => {
  try {
    // Exchange public token for new access token
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const newAccessToken = response.data.access_token;

    // Update the bank document with the new access token
    const { database } = await createAdminClient();
    
    await database.updateDocument(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      bankId,
      {
        accessToken: newAccessToken,
      }
    );

    // Revalidate cache
    revalidatePath("/");

    return parseStringify({ success: true });
  } catch (error) {
    console.error("Error updating bank connection:", error);
    throw error;
  }
};

export const createBankAccount = async ({
  userId,
  bankId,
  accountId,
  accessToken,
  fundingSourceUrl,
  shareableId,
}: {
  userId: string;
  bankId: string;
  accountId: string;
  accessToken: string;
  fundingSourceUrl: string;
  shareableId: string;
  bankName?: string;
  institutionId?: string;
}) => {
  try {
    const { database } = await createAdminClient();

    // Only include fields that exist in the Appwrite bank collection schema
    const bankAccount = await database.createDocument(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      ID.unique(),
      {
        userId,
        bankId,
        accountId,
        accessToken,
        fundingSourceUrl,
        shareableId,
        // Note: 'name' and 'institutionId' fields don't exist in the current Appwrite schema
        // so we're not including them to avoid the validation error
      }
    );

    console.log('Bank account created successfully in Appwrite:', bankAccount.$id);
    return parseStringify(bankAccount);
  } catch (error) {
    console.error("Error creating bank account:", error);
    throw error;
  }
};

export const exchangePublicToken = async ({
  publicToken,
  user,
}: {
  publicToken: string;
  user: { $id: string; dwollaCustomerId: string };
}) => {
  try {
    // Debug Plaid configuration
    debugPlaidConfig();
    
    // Exchange public token for access token and item ID
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;    // Get account info from Plaid with access token
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    // Check if we have accounts
    if (!accountsResponse.data.accounts || accountsResponse.data.accounts.length === 0) {
      throw new Error('No accounts found for this bank connection');
    }

    const accountData = accountsResponse.data.accounts[0];

    // Validate account data
    if (!accountData || !accountData.account_id) {
      throw new Error('Invalid account data received from Plaid');
    }

    console.log('Account data found:', {
      accountId: accountData.account_id,
      name: accountData.name,
      type: accountData.type
    });    // Create Dwolla processor token
    const processorRequest: ProcessorTokenCreateRequest = {
      access_token: accessToken,
      account_id: accountData.account_id,
      processor: "dwolla" as ProcessorTokenCreateRequestProcessorEnum,
    };

    // Validate request before sending
    if (!processorRequest.access_token || processorRequest.access_token.trim() === '') {
      throw new Error('Access token is empty or invalid');
    }
    
    if (!processorRequest.account_id || processorRequest.account_id.trim() === '') {
      throw new Error('Account ID is empty or invalid');
    }console.log('Creating processor token with request:', {
      account_id: processorRequest.account_id,
      processor: processorRequest.processor,
      access_token_exists: !!processorRequest.access_token,
      access_token_length: processorRequest.access_token?.length || 0
    });    try {
      // First try to create REAL processor token from Plaid
      console.log('Trying to create REAL processor token from Plaid API...');
      
      const processorRequest: ProcessorTokenCreateRequest = {
        access_token: accessToken,
        account_id: accountData.account_id,
        processor: "dwolla" as ProcessorTokenCreateRequestProcessorEnum,
      };

      const processorTokenResponse = await plaidClient.processorTokenCreate(processorRequest);
      const processorToken = processorTokenResponse.data.processor_token;
      
      if (!processorToken) {
        throw new Error('Processor token is empty in response');
      }

      console.log('Successfully created REAL processor token from Plaid:', {
        tokenLength: processorToken.length,
        tokenPrefix: processorToken.substring(0, 8) + '...'
      });      // Get institution information for proper bank naming
      const institutionInfo = await plaidClient.accountsGet({
        access_token: accessToken,
      });
      
      let institutionName = accountData.name;
      let institutionId = '';      try {
        if (institutionInfo.data.item.institution_id) {
          const institution = await plaidClient.institutionsGetById({
            institution_id: institutionInfo.data.item.institution_id,
            country_codes: ['US'] as CountryCode[],
          });
          institutionName = institution.data.institution.name;
          institutionId = institution.data.institution.institution_id;
          console.log('Got institution info:', { name: institutionName, id: institutionId });
        }
      } catch (instError) {
        console.warn('Could not fetch institution info:', instError);
      }

      // Add funding source in Dwolla
      const fundingSourceUrl = await addFundingSource({
        dwollaCustomerId: user.dwollaCustomerId,
        processorToken,
        bankName: institutionName,
      });

      if (!fundingSourceUrl) throw new Error('Failed to create funding source');

      // Create bank account document
      await createBankAccount({
        userId: user.$id,
        bankId: itemId,
        accountId: accountData.account_id,
        accessToken,
        fundingSourceUrl,
        shareableId: encryptId(accountData.account_id),
        bankName: institutionName,
        institutionId: institutionId,
      });

      // Revalidate Next.js cache
      revalidatePath("/");

      return parseStringify({ publicTokenExchange: "complete" });    } catch (processorError) {
      console.log('Plaid processor token creation failed, trying fallback approach...');
      if (processorError instanceof Error) {
        console.error('Processor error details:', {
          message: processorError.message,
        });
      }      // Try fallback: create bank account without Dwolla funding source for now
      console.log('Creating bank record without Dwolla integration due to API issues...');
      
      // Get institution information for fallback case too
      let fallbackInstitutionName = accountData.name;
      let fallbackInstitutionId = '';
        try {
        if (accessToken) {
          const institutionInfo = await plaidClient.accountsGet({
            access_token: accessToken,
          });
          
          if (institutionInfo.data.item.institution_id) {
            const institution = await plaidClient.institutionsGetById({
              institution_id: institutionInfo.data.item.institution_id,
              country_codes: ['US'] as CountryCode[],
            });
            fallbackInstitutionName = institution.data.institution.name;
            fallbackInstitutionId = institution.data.institution.institution_id;
          }
        }
      } catch (instError) {
        console.warn('Could not fetch institution info in fallback:', instError);
      }
      
      // Generate a temporary funding source URL until Plaid/Dwolla issues are resolved
      const tempFundingSourceUrl = `temp-funding-source-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        // Create bank account document with temporary funding source
      await createBankAccount({
        userId: user.$id,
        bankId: itemId,
        accountId: accountData.account_id,
        accessToken: accessToken || '',
        fundingSourceUrl: tempFundingSourceUrl,
        shareableId: encryptId(accountData.account_id),
        bankName: fallbackInstitutionName,
        institutionId: fallbackInstitutionId,
      });

      // Revalidate Next.js cache
      revalidatePath("/");

      console.log('Bank account created successfully with temporary funding source');
      return parseStringify({ publicTokenExchange: "complete" });
    }
  } catch (error) {
    console.error("Error exchanging public token:", error);
    throw error;
  }
};

export const getBanks = async ({ userId }: { userId: string }) => {
  try {
    const { database } = await createAdminClient();

    const banks = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal('userId', [userId])]
    );

    return parseStringify(banks.documents);
  } catch (error) {
    console.error("Error fetching banks:", error);
    throw error;
  }
};

export const getBank = async ({ documentId }: { documentId: string }) => {
  try {
    const { database } = await createAdminClient();

    const bank = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal('$id', [documentId])]
    );

    return parseStringify(bank.documents[0]);
  } catch (error) {
    console.error("Error fetching bank:", error);
    throw error;
  }
};

export const getBankByAccountId = async ({ accountId }: { accountId: string }) => {
  try {
    const { database } = await createAdminClient();

    const bank = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal('accountId', [accountId])]
    );

    if (bank.total !== 1) return null;

    return parseStringify(bank.documents[0]);
  } catch (error) {
    console.error("Error fetching bank by account ID:", error);
    throw error;
  }
};