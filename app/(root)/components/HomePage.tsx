'use client';

import { useState } from 'react';
import HeaderBox from '@/components/HeaderBox';
import RecentTransactions from '@/components/RecentTransactions';
import RightSidebar from '@/components/RightSidebar';
import TotalBalanceBox from '@/components/TotalBalanceBox';
import PlaidLink from '@/components/PlaidLink';
import { Account, Bank, Transaction, User } from '@/types';

interface HomePageProps {
  loggedIn: User;
  accounts: {
    data: Account[];
    totalBanks: number;
    totalCurrentBalance: number;
  };
  account: {
    data: Account;
    transactions: Transaction[];
  };
  appwriteItemId: string;
  currentPage: number;
}

const HomePage = ({ 
  loggedIn, 
  accounts, 
  account, 
  appwriteItemId, 
  currentPage 
}: HomePageProps) => {
  const [isReauthModalOpen, setIsReauthModalOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);

  const handleReauth = (account: Account) => {
    const bank: Bank = {
      $id: account.id,
      accountId: account.id,
      bankId: account.bankId || '',
      fundingSourceUrl: account.fundingSourceUrl || '',
      userId: account.userId || '',
      accessToken: account.accessToken || '',
      shareableId: ''
    };
    setSelectedBank(bank);
    setIsReauthModalOpen(true);
  };

  const handleReauthSuccess = () => {
    setIsReauthModalOpen(false);
    setSelectedBank(null);
    window.location.reload();
  };

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
            accounts={accounts.data}
            totalBanks={accounts?.totalBanks}
            totalCurrentBalance={accounts?.totalCurrentBalance}
          />
        </header>

        <RecentTransactions
          accounts={accounts.data}
          transactions={account?.transactions}
          appwriteItemId={appwriteItemId}
          page={currentPage}
          user={loggedIn}
          onReauth={handleReauth}
        />
      </div>

      <RightSidebar
        user={loggedIn}
        transactions={account?.transactions}
        banks={accounts.data.slice(0, 2).map(account => ({
          ...account,
          $id: account.id, // Assuming `id` exists in `Account` and maps to `$id`
          accountId: account.id, // Map `id` to `accountId` if applicable
          bankId: account.bankId || '', // Provide a default or extract `bankId` if available
          fundingSourceUrl: account.fundingSourceUrl || '', // Provide a default or extract `fundingSourceUrl`
          userId: account.userId || '', // Provide a default or extract `userId`
          accessToken: account.accessToken || '', // Ensure accessToken is always a string
        }))}
      />

      {isReauthModalOpen && selectedBank && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg">
            <h2 className="text-xl mb-4">Re-authenticate Bank Account</h2>
            <p className="mb-4">Please re-authenticate your connection to continue accessing your account.</p>
            <PlaidLink
              user={loggedIn}
              variant="primary"
              accessToken={selectedBank.accessToken}
              onReauthSuccess={handleReauthSuccess}
            />
          </div>
        </div>
      )}
    </section>
  );
};

export default HomePage;