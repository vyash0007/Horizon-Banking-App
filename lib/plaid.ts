import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const getPlaidEnvironment = () => {
  const env = process.env.PLAID_ENV;
  switch (env) {
    case 'sandbox':
      return PlaidEnvironments.sandbox;
    case 'production':
      return PlaidEnvironments.production;
    default:
      console.warn(`Unknown PLAID_ENV: ${env}, defaulting to sandbox`);
      return PlaidEnvironments.sandbox;
  }
};

const configuration = new Configuration({
  basePath: getPlaidEnvironment(),
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
      'Plaid-Version': '2020-09-14',
    },
    timeout: 30000, // 30 second timeout for processor token requests
  },
});

export const plaidClient = new PlaidApi(configuration);