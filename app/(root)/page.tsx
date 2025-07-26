import HeaderBox from '@/components/HeaderBox'
import RecentTransactions from '@/components/RecentTransactions';
import RightSidebar from '@/components/RightSidebar';
import TotalBalanceBox from '@/components/TotalBalanceBox';
import { getAccount, getAccounts } from '@/lib/actions/bank.actions';
import { getLoggedInUser } from '@/lib/actions/user.actions';

interface SearchParamProps {
  searchParams: Record<string, any>; // Adjust type as needed
}

const Home = async ({ searchParams }: SearchParamProps) => {
  // Await searchParams because it's async in Next.js dynamic API routes
  const { id, page } = await searchParams;

  // Parse page param safely if you need it later
  const currentPage = Number(page) || 1;

  const loggedIn = await getLoggedInUser();

  // Defensive check if user is not logged in
  if (!loggedIn) {
    return <section>Please log in to access your account.</section>;
  }

  const accounts = await getAccounts({
    userId: loggedIn.$id,
  });

  // Defensive: if accounts is falsy or empty, show a fallback UI or loading state
  if (!accounts || !accounts.data || accounts.data.length === 0) {
    return <section>No accounts found.</section>;
  }

  const accountsData = accounts.data;

  // Use provided id or fallback to first account's appwriteItemId
  const appwriteItemId = (id as string) || accountsData[0]?.appwriteItemId;

  // Defensive: if no appwriteItemId can be found, early return
  if (!appwriteItemId) {
    return <section>No valid account selected.</section>;
  }

  const account = await getAccount({ appwriteItemId });

  return (
    <section className="home">
      <div className="home-content">
        <header className="home-header">
          <HeaderBox
            type="greeting"
            title="Welcome"
            user={loggedIn?.firstName || 'Guest'}
            subtext="Access and manage your account and transactions efficiently."
          />

          <TotalBalanceBox
            accounts={accountsData}
            totalBanks={accounts?.totalBanks}
            totalCurrentBalance={accounts?.totalCurrentBalance}
          />
        </header>

        {/* Uncomment and pass currentPage once you handle page param correctly */}
        
        <RecentTransactions
          accounts={accountsData}
          transactions={account?.transactions}
          appwriteItemId={appwriteItemId}
          page={currentPage}
        /> 
       
      </div>

      <RightSidebar
        user={loggedIn}
        transactions={account?.transactions}
        banks={accountsData.slice(0, 2)}
      />
    </section>
  );
};

export default Home;
