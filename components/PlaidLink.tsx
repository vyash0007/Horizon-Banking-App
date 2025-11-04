"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from './ui/button';
import { PlaidLinkOnSuccess, PlaidLinkOptions, usePlaidLink } from 'react-plaid-link';
import { useRouter } from 'next/navigation';
import { createLinkToken, createUpdateLinkToken, exchangePublicToken } from '@/lib/actions/user.actions';
import Image from 'next/image';
import { User } from '@/types';

interface PlaidLinkProps {
  user: User;
  variant?: 'primary' | 'ghost' | 'default';
  accessToken?: string;
  onReauthSuccess?: () => void;
}

const PlaidLink = ({ user, variant = 'default', accessToken, onReauthSuccess }: PlaidLinkProps) => {
  const router = useRouter();
  const [token, setToken] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getLinkToken = async () => {
      if (!user) return;
      try {
        setIsLoading(true);
        setError(null);
        let data;
        if (accessToken) {
          // If we have an accessToken, we're in update mode
          data = await createUpdateLinkToken(accessToken, user.$id);
        } else {
          // Otherwise, we're in create mode
          data = await createLinkToken(user);
        }
        
        if (data?.linkToken) {
          setToken(data.linkToken);
        } else {
          setError('Failed to get link token');
        }
      } catch (error) {
        console.error('Error creating link token:', error);
        setError('Error connecting to bank');
      } finally {
        setIsLoading(false);
      }
    };

    getLinkToken();
  }, [user, accessToken]);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (public_token) => {
      try {
        setIsLoading(true);
        setError(null);
        await exchangePublicToken({
          publicToken: public_token,
          user: {
            $id: user.$id,
            dwollaCustomerId: user.dwollaCustomerId,
          },
        });

        if (onReauthSuccess) {
          onReauthSuccess();
        } else {
          router.refresh();
        }
      } catch (error) {
        console.error('Error in Plaid onSuccess handler:', error);
        setError('Error linking bank account');
      } finally {
        setIsLoading(false);
      }
    },
    [user, router, onReauthSuccess]
  );

  const config: PlaidLinkOptions = {
    token,
    onSuccess,
    onExit: () => {
      setError(null);
    },
  };

  const { open, ready } = usePlaidLink(config);

  const buttonDisabled = !ready || isLoading;

  if (variant === 'primary') {
    return (
      <div className="flex flex-col gap-2">
        <Button
          onClick={() => open()}
          disabled={buttonDisabled}
          className="plaidlink-primary w-full"
          type="button"
        >
          {isLoading ? (
            <span>Connecting...</span>
          ) : (
            <>
              <Image
                src="/icons/connect-bank.svg"
                alt="connect bank"
                width={24}
                height={24}
              />
              <p className="hiddenl text-[16px] font-semibold xl:block">
                {accessToken ? 'Reconnect bank' : 'Connect bank'}
              </p>
            </>
          )}
        </Button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  if (variant === 'ghost') {
    return (
      <div className="flex flex-col gap-2">
        <Button
          onClick={() => open()}
          disabled={buttonDisabled}
          className="plaidlink-ghost"
          type="button"
        >
          {isLoading ? (
            <span>Connecting...</span>
          ) : (
            <>
              <Image
                src="/icons/connect-bank.svg"
                alt="connect bank"
                width={24}
                height={24}
              />
              <p className="text-[16px] font-semibold text-black-2">Connect bank</p>
            </>
          )}
        </Button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={() => open()}
        disabled={buttonDisabled}
        className="plaidlink-default"
        type="button"
      >
        {isLoading ? (
          <span>Connecting...</span>
        ) : (
          <>
            <Image
              src="/icons/connect-bank.svg"
              alt="connect bank"
              width={24}
              height={24}
            />
            <p className="text-[16px] font-semibold text-black-2">
              {accessToken ? 'Reconnect bank' : 'Connect bank'}
            </p>
          </>
        )}
      </Button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
};

export default PlaidLink;
