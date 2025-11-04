"use server";

import { AddFundingSourceParams, CreateFundingSourceOptions, NewDwollaCustomerParams, TransferParams } from "@/types";
import { Client } from "dwolla-v2";

const getEnvironment = (): "production" | "sandbox" => {
  const environment = process.env.DWOLLA_ENV as string;

  switch (environment) {
    case "sandbox":
      return "sandbox";
    case "production":
      return "production";
    default:
      throw new Error(
        "Dwolla environment should either be set to `sandbox` or `production`"
      );
  }
};

const dwollaClient = new Client({
  environment: getEnvironment(),
  key: process.env.DWOLLA_KEY as string,
  secret: process.env.DWOLLA_SECRET as string,
});

// Create a Dwolla Funding Source using a Plaid Processor Token
export const createFundingSource = async (
  options: CreateFundingSourceOptions
) => {
  try {
    // Check if plaidToken exists
    if (!options.plaidToken) {
      throw new Error("Plaid token is required but not provided");
    }

    console.log("Creating REAL funding source with Dwolla API:", JSON.stringify({
      name: options.fundingSourceName,
      hasToken: !!options.plaidToken,
      tokenPrefix: options.plaidToken.substring(0, 15) + '...',
      customerId: options.customerId
    }, null, 2));

    const requestBody: Record<string, unknown> = {
      name: options.fundingSourceName,
      plaidToken: options.plaidToken,
    };

    // Only add _links if it exists and is valid
    if (options._links) {
      requestBody._links = options._links;
    }

    console.log("Calling REAL Dwolla API to create funding source...");

    const response = await dwollaClient
      .post(`customers/${options.customerId}/funding-sources`, requestBody);
    
    const fundingSourceUrl = response.headers.get("location");
    console.log("REAL funding source created successfully:", fundingSourceUrl);
    
    return fundingSourceUrl;
  } catch (err) {
    console.error("Creating a Funding Source Failed: ", err);
    if (err && typeof err === 'object' && 'status' in err) {
      console.error("Error details:", {
        status: (err as Record<string, unknown>).status,
        body: (err as Record<string, unknown>).body,
        message: (err as unknown as Error).message
      });
    }
    throw err; // Re-throw to handle in calling function
  }
};

export const createOnDemandAuthorization = async () => {
  try {
    const onDemandAuthorization = await dwollaClient.post(
      "on-demand-authorizations"
    );
    const authLink = onDemandAuthorization.body._links;
    console.log("On-demand authorization created:", authLink);
    return authLink;
  } catch (err) {
    console.error("Creating an On Demand Authorization Failed: ", err);
    throw err;
  }
};

const stateNameToAbbreviation = (stateName: string): string => {
  const states: Record<string, string> = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
    'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
    'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
    'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
    'Wisconsin': 'WI', 'Wyoming': 'WY'
  };

  const input = stateName.trim();
  
  // If it's already a 2-letter code, make sure it's uppercase
  if (input.length === 2) {
    return input.toUpperCase();
  }
  
  // Try to find by full state name (case insensitive)
  const foundState = Object.keys(states).find(
    state => state.toLowerCase() === input.toLowerCase()
  );
  
  if (foundState) {
    return states[foundState];
  }
  
  // If not found, return uppercase version (fallback)
  return input.toUpperCase().substring(0, 2);
};

export const createDwollaCustomer = async (
  newCustomer: NewDwollaCustomerParams
) => {
  try {
    // Fix state value if passed as full name
    if (newCustomer.state?.length !== 2) {
      newCustomer.state = stateNameToAbbreviation(newCustomer.state);
    }

    // Ensure state is uppercase
    if (newCustomer.state) {
      newCustomer.state = newCustomer.state.toUpperCase();
    }

    // Validate required fields for Dwolla
    if (!newCustomer.firstName || !newCustomer.lastName) {
      throw new Error("First name and last name are required");
    }

    if (!newCustomer.email || !newCustomer.email.includes('@')) {
      throw new Error("Valid email address is required");
    }

    if (!newCustomer.dateOfBirth) {
      throw new Error("Date of birth is required");
    }

    if (!newCustomer.ssn || newCustomer.ssn.length < 4) {
      throw new Error("SSN (last 4 digits) is required");
    }

    if (!newCustomer.address1 || !newCustomer.city || !newCustomer.state || !newCustomer.postalCode) {
      throw new Error("Complete address information is required");
    }

    // DEBUG: Log structure being sent
    console.log("Creating Dwolla customer with:", {
      ...newCustomer,
      ssn: '[HIDDEN]' // Don't log SSN for security
    });

    const response = await dwollaClient.post("customers", newCustomer);
    const customerUrl = response.headers.get("location");
    
    console.log("Dwolla customer created successfully:", customerUrl);
    return customerUrl;
  } catch (err) {
    const errorObj = err as Record<string, unknown>;
    const body = errorObj?.body as Record<string, unknown> || {};
    const embedded = body?._embedded as Record<string, unknown>;
    const errors = embedded?.errors as Array<Record<string, unknown>>;
    
    const isDuplicateEmail =
      errors?.[0]?.code === "Duplicate" &&
      errors?.[0]?.path === "/email";

    if (isDuplicateEmail) {
      const links = errors[0]?._links as Record<string, { href: string }>;
      const existingCustomerUrl = links?.about?.href;
      console.warn('⚠️ Dwolla customer already exists. Reusing:', existingCustomerUrl);
      return existingCustomerUrl;
    }

    // Handle specific validation errors
    if (errors && Array.isArray(errors)) {
      const errorMessages = errors.map((error: Record<string, unknown>) => 
        `${error.path}: ${error.message}`
      ).join(', ');
      console.error("Dwolla validation errors:", errorMessages);
      throw new Error(`Dwolla validation failed: ${errorMessages}`);
    }

    console.error("Creating a Dwolla Customer Failed: ", JSON.stringify(body, null, 2));
    const errorMessage = (err as Error).message || 'Unknown error';
    throw new Error(`Error creating Dwolla customer: ${errorMessage}`);
  }
};


  // export const createDwollaCustomer = async (
  //   newCustomer: NewDwollaCustomerParams
  // ) => {
  //   try {
  //     return await dwollaClient
  //       .post("customers", newCustomer)
  //       .then((res) => res.headers.get("location"));
  //   } catch (err) {
  //     console.error("Creating a Dwolla Customer Failed: ", err);
  //   }
  // };

  export const createTransfer = async ({
    sourceFundingSourceUrl,
    destinationFundingSourceUrl,
    amount,
  }: TransferParams) => {
    try {
      const requestBody = {
        _links: {
          source: {
            href: sourceFundingSourceUrl,
          },
          destination: {
            href: destinationFundingSourceUrl,
          },
        },
        amount: {
          currency: "USD",
          value: amount,
        },
      };
      return await dwollaClient
        .post("transfers", requestBody)
        .then((res) => res.headers.get("location"));
    } catch (err) {
      console.error("Transfer fund failed: ", err);
    }
  };  export const addFundingSource = async ({
    dwollaCustomerId,
    processorToken,
    bankName,
  }: AddFundingSourceParams) => {
    try {
      console.log("addFundingSource called with:", {
        dwollaCustomerId,
        processorToken: processorToken ? "exists" : "missing",
        bankName
      });

      // Check if processorToken exists
      if (!processorToken) {
        throw new Error("Processor token is required but not provided");
      }

      // First try to create funding source without authorization links
      const fundingSourceOptions: CreateFundingSourceOptions = {
        customerId: dwollaCustomerId,
        fundingSourceName: bankName,
        plaidToken: processorToken, // Make sure processorToken is passed as plaidToken
      };
      
      console.log("Attempting to create funding source without auth links...");
      
      try {
        return await createFundingSource(fundingSourceOptions);
      } catch {
        console.log("Failed without auth links, trying with auth links...");
        
        // If that fails, try with authorization links
        const dwollaAuthLinks = await createOnDemandAuthorization();
        
        const optionsWithAuth = {
          ...fundingSourceOptions,
          _links: dwollaAuthLinks
        };
        
        console.log("Funding source options with auth:", optionsWithAuth);
        
        return await createFundingSource(optionsWithAuth);
      }
    } catch (err) {
      console.error("Add funding source failed: ", err);
      throw err; // Re-throw to handle in calling function
    }
  };