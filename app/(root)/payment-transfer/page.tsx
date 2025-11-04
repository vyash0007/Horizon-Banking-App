import HeaderBox from '@/components/HeaderBox'
import PaymentTransferForm from '@/components/PaymentTransferForm'
import { getAccounts } from '@/lib/actions/bank.actions';
import { getLoggedInUser } from '@/lib/actions/user.actions';
import React from 'react'

const Transfer = async () => {
  const loggedIn = await getLoggedInUser();

  if (!loggedIn) {
    return <section>Please log in to access payment transfer.</section>;
  }

  const accounts = await getAccounts({ 
    userId: loggedIn.$id 
  })

  if(!accounts || !accounts.data || accounts.data.length === 0) {
    return <section>No accounts found. Please add a bank account first.</section>;
  }
  
  const accountsData = accounts.data;

  return (
    <section className="payment-transfer">
      <HeaderBox 
        title="Payment Transfer"
        subtext="Please provide any specific details or notes related to the payment transfer"
      />

      <section className="size-full pt-5">
        <PaymentTransferForm accounts={accountsData} />
      </section>
    </section>
  )
}

export default Transfer