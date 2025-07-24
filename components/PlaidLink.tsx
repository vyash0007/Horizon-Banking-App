import React, { useCallback, useEffect, useState } from 'react';
import { Button } from './ui/button';
import { PlaidLinkOnSuccess, PlaidLinkOptions, usePlaidLink } from 'react-plaid-link';
import { useRouter } from 'next/navigation';
import { createLinkToken, exchangePublicToken } from '@/lib/actions/user.actions';
import Image from 'next/image';

interface PlaidLinkProps {
  user: any; // Replace with your actual user type
  variant?: 'primary' | 'ghost' | 'default';
}

const PlaidLink = ({ user, variant = 'default' }: PlaidLinkProps) => {
  const router = useRouter();
  const [token, setToken] = useState<string>('');

  useEffect(() => {
    const getLinkToken = async () => {
      if (!user) return;
      try {
        const data = await createLinkToken(user);
        if (data?.linkToken) {
          setToken(data.linkToken);
        } else {
          console.error('Failed to get link token');
        }
      } catch (error) {
        console.error('Error creating link token:', error);
      }
    };

    getLinkToken();
  }, [user]);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(async (public_token) => {
    try {
      await exchangePublicToken({
        publicToken: public_token,
        user,
      });
      router.push('/');
    } catch (error) {
      console.error('Error exchanging public token:', error);
    }
  }, [user, router]);

  const config: PlaidLinkOptions = {
    token,
    onSuccess,
  };

  const { open, ready } = usePlaidLink(config);

  if (!token) {
    // Optionally render a loading state while token is being fetched
    return <Button disabled>Loading...</Button>;
  }

  return (
    <>
      {variant === 'primary' ? (
        <Button
          onClick={() => open()}
          disabled={!ready}
          className="plaidlink-primary"
          type="button"
        >
          Connect bank
        </Button>
      ) : variant === 'ghost' ? (
        <Button
          onClick={() => open()}
          disabled={!ready}
          variant="ghost"
          className="plaidlink-ghost"
          type="button"
        >
          <Image
            src="/icons/connect-bank.svg"
            alt="connect bank"
            width={24}
            height={24}
          />
          <p className="hiddenl text-[16px] font-semibold text-black-2 xl:block">Connect bank</p>
        </Button>
      ) : (
        <Button
          onClick={() => open()}
          disabled={!ready}
          className="plaidlink-default"
          type="button"
        >
          <Image
            src="/icons/connect-bank.svg"
            alt="connect bank"
            width={24}
            height={24}
          />
          <p className="text-[16px] font-semibold text-black-2">Connect bank</p>
        </Button>
      )}
    </>
  );
};

export default PlaidLink;
