"use server";

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
    return await dwollaClient
      .post(`customers/${options.customerId}/funding-sources`, {
        name: options.fundingSourceName,
        plaidToken: options.plaidToken,
      })
      .then((res) => res.headers.get("location"));
  } catch (err) {
    console.error("Creating a Funding Source Failed: ", err);
  }
};

export const createOnDemandAuthorization = async () => {
  try {
    const onDemandAuthorization = await dwollaClient.post(
      "on-demand-authorizations"
    );
    const authLink = onDemandAuthorization.body._links;
    return authLink;
  } catch (err) {
    console.error("Creating an On Demand Authorization Failed: ", err);
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

  return states[stateName.trim()] ?? stateName.toUpperCase().trim(); // fallback
};

export const createDwollaCustomer = async (
  newCustomer: NewDwollaCustomerParams
) => {
  try {
    // Fix state value if passed as full name
    if (newCustomer.state?.length !== 2) {
      newCustomer.state = stateNameToAbbreviation(newCustomer.state);
    }

    // DEBUG: Log structure being sent
    console.log("Creating Dwolla customer with:", newCustomer);

    const response = await dwollaClient.post("customers", newCustomer);
    return response.headers.get("location");
  } catch (err: any) {
    const body = err?.body || {};
    const isDuplicateEmail =
      body?._embedded?.errors?.[0]?.code === "Duplicate" &&
      body?._embedded?.errors?.[0]?.path === "/email";

    if (isDuplicateEmail) {
      const existingCustomerUrl = body?._embedded?.errors?.[0]?._links?.about.href;
      console.warn('⚠️ Dwolla customer already exists. Reusing:', existingCustomerUrl);
      return existingCustomerUrl;}
      console.error("Creating a Dwolla Customer Failed: ", JSON.stringify(body, null, 2));
      throw new Error("Error creating Dwolla customer");
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
  };

  export const addFundingSource = async ({
    dwollaCustomerId,
    processorToken,
    bankName,
  }: AddFundingSourceParams) => {
    try {
      // create dwolla auth link
      const dwollaAuthLinks = await createOnDemandAuthorization();

      // add funding source to the dwolla customer & get the funding source url
      const fundingSourceOptions = {
        customerId: dwollaCustomerId,
        fundingSourceName: bankName,
        plaidToken: processorToken,
        _links: dwollaAuthLinks,
      };
      return await createFundingSource(fundingSourceOptions);
    } catch (err) {
      console.error("Transfer fund failed: ", err);
    }
  };