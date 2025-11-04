'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from './ui/button';
import { useRouter } from 'next/navigation';
import { 
  PlaidLinkOnSuccess, 
  PlaidLinkOptions, 
  usePlaidLink 
} from 'react-plaid-link';
import { createUpdateLinkToken, updateBankConnection, getBank } from '@/lib/actions/user.actions';
import { User } from '@/types';

interface PlaidUpdateLinkProps {
  user: User;
  bankId: string;
  accessToken?: string; // Make it optional since we'll fetch it
  variant?: "primary" | "ghost";
}

const PlaidUpdateLink = ({ 
  user, 
  bankId, 
  accessToken,
  variant = "primary" 
}: PlaidUpdateLinkProps) => {
  const router = useRouter();  const [token, setToken] = useState('');
  const [, setBankAccessToken] = useState('');

  useEffect(() => {
    const getLinkUpdateToken = async () => {
      try {
        console.log('PlaidUpdateLink: Creating update token for bank:', bankId);
        
        // If no access token provided, fetch the bank data to get it
        let tokenToUse = accessToken;
        if (!tokenToUse) {
          try {
            const bankData = await getBank({ documentId: bankId });
            tokenToUse = bankData?.accessToken;
            setBankAccessToken(tokenToUse || '');
            console.log('PlaidUpdateLink: Fetched access token from bank data:', !!tokenToUse);
          } catch (error) {
            console.error('PlaidUpdateLink: Error fetching bank data:', error);
            return;
          }
        } else {
          setBankAccessToken(tokenToUse);
        }

        if (!tokenToUse) {
          console.error('PlaidUpdateLink: No access token available');
          return;
        }

        const data = await createUpdateLinkToken(tokenToUse, user.$id);
        console.log('PlaidUpdateLink: Update token received:', !!data?.linkToken);
        setToken(data?.linkToken);
      } catch (error) {
        console.error('PlaidUpdateLink: Error creating update link token:', error);
        // Don't set token if there's an error - the button will be disabled
      }
    };

    if (user.$id && bankId) {
      getLinkUpdateToken();
    }
  }, [user, accessToken, bankId]);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (public_token: string) => {
      try {
        await updateBankConnection({
          publicToken: public_token,
          bankId,
        });

        router.push('/');
      } catch (error) {
        console.error('Error updating bank connection:', error);
      }
    },
    [bankId, router]
  );

  const config: PlaidLinkOptions = {
    token,
    onSuccess,
  };

  const { open, ready } = usePlaidLink(config);

  return (
    <>
      {variant === 'primary' ? (
        <Button
          onClick={() => open()}
          disabled={!ready}
          className="plaidlink-primary"
        >
          Reconnect Bank
        </Button>
      ) : variant === 'ghost' ? (
        <Button
          onClick={() => open()}
          variant="ghost"
          className="plaidlink-ghost"
          disabled={!ready}
        >
          Reconnect Bank
        </Button>
      ) : (
        <Button
          onClick={() => open()}
          className="plaidlink-default"
          disabled={!ready}
        >
          Reconnect Bank
        </Button>
      )}
    </>
  );
};

export default PlaidUpdateLink;
