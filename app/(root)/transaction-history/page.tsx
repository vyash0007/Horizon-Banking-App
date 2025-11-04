import HeaderBox from '@/components/HeaderBox'
import { Pagination } from '@/components/Pagination';
import TransactionsTable from '@/components/TransactionsTable';
import { getAccount, getAccounts } from '@/lib/actions/bank.actions';
import { getLoggedInUser } from '@/lib/actions/user.actions';
import { formatAmount } from '@/lib/utils';
import React from 'react'

async function TransactionHistory({
  params, searchParams,
}: {
  params: Promise<{ [key: string]: string; }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined; }>;
}): Promise<React.JSX.Element> {
  // Await params but don't assign it since we don't use it
  await params;
  const resolvedSearchParams = await searchParams;
  
  const { id, page } = resolvedSearchParams;
  const currentPage = Number(page as string) || 1;
  const loggedIn = await getLoggedInUser();

  if (!loggedIn) {
    return <section>Please log in to access transaction history.</section>;
  }

  const accounts = await getAccounts({
    userId: loggedIn.$id
  });

  if (!accounts || !accounts.data || accounts.data.length === 0) {
    return <section>No accounts found.</section>;
  }

  const accountsData = accounts.data;
  const appwriteItemId = (id as string) || accountsData[0]?.appwriteItemId;

  if (!appwriteItemId) {
    return <section>No valid account selected.</section>;
  }

  const account = await getAccount({ appwriteItemId });

  if (!account) {
    return <section>Could not load account details.</section>;
  }

  const rowsPerPage = 10;
  const totalPages = Math.ceil((account?.transactions?.length || 0) / rowsPerPage);

  const indexOfLastTransaction = currentPage * rowsPerPage;
  const indexOfFirstTransaction = indexOfLastTransaction - rowsPerPage;

  const currentTransactions = account?.transactions?.slice(
    indexOfFirstTransaction, indexOfLastTransaction
  ) || [];
  
  return (
    <div className="transactions">
      <div className="transactions-header">
        <HeaderBox
          title="Transaction History"
          subtext="See your bank details and transactions." />
      </div>

      <div className="space-y-6">
        <div className="transactions-account">
          <div className="flex flex-col gap-2">
            <h2 className="text-18 font-bold text-white">{account?.data.name}</h2>
            <p className="text-14 text-blue-25">
              {account?.data.officialName}
            </p>
            <p className="text-14 font-semibold tracking-[1.1px] text-white">
              ●●●● ●●●● ●●●● {account?.data.mask}
            </p>
          </div>

          <div className='transactions-account-balance'>
            <p className="text-14">Current balance</p>
            <p className="text-24 text-center font-bold">{formatAmount(account?.data.currentBalance)}</p>
          </div>
        </div>

        <section className="flex w-full flex-col gap-6">
          <TransactionsTable
            transactions={currentTransactions} />
          {totalPages > 1 && (
            <div className="my-4 w-full">
              <Pagination totalPages={totalPages} page={currentPage} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default TransactionHistory