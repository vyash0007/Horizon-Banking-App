import { formatAmount } from '@/lib/utils'
import Link from 'next/link'
import React from 'react'
import Image from 'next/image'

const BankCard = ({ account, userName, showBalance = true }: CreditCardProps) => {
    return (
        <div className='flex flex-col'>
            <Link href="/" className='bank-card'>
                <div className='bank-card_content'>
                    <div>
                        <h1 className='text-16 font-semibold'>
                            {userName}
                        </h1>
                        <p className='font-ibm-plex-serif font-black text-white'>
                            {formatAmount(account.currentBalance)}
                        </p>
                    </div>
                    <article className='flex flex-col gap-2'>
                        <div className='flex justify-between'>
                            <h1 className='text-12 font-semibold text-white'>
                                {userName}
                            </h1>
                            <h1 className='text-12 font-semibold text-white'>
                            ●● / ●●
                            </h1>
                        </div>
                        <p className='text-14 font-semibold tracking-[1.1px] text-white'>
                          ●●●● ●●●● ●●●● <span className='text-16'> {1234} </span>
                        </p>
                    </article>
                </div>
                <div className='bank-card_icon'>
                    <Image
                        src="/icons/Paypass.svg"
                        height={24}
                        width={20}
                        alt="pay"
                    />
                    <Image
                        src="/icons/mastercard.svg"
                        height={32}
                        width={45}
                        alt="mastercard"
                        className='ml-5'
                    />
                </div>
                <Image
                    src="/icons/lines.ong"
                    height={190}
                    width={316}
                    alt="lines"
                    className='absolute top-0 left-0'
                />
            </Link>
        </div>
    )
}

export default BankCard