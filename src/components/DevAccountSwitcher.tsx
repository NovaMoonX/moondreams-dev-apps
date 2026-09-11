import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { FIXTURE_PASSWORD, FIXTURE_USERS } from '@lib/dev/fixtureAccounts';
import { auth, isUsingFirebaseEmulators } from '@lib/firebase/config';

const fixtureAccounts = Object.values(FIXTURE_USERS);

export function DevAccountSwitcher() {
  const { user } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string>();

  if (!isUsingFirebaseEmulators || !import.meta.env.DEV) {
    return null;
  }

  const signInAsFixture = async (email: string) => {
    setIsSigningIn(true);
    setError(undefined);

    try {
      await signInWithEmailAndPassword(auth, email, FIXTURE_PASSWORD);
    } catch (signInError) {
      const message =
        signInError instanceof Error
          ? signInError.message
          : 'Could not sign in to the emulator fixture.';
      setError(message);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className='border-border bg-card pointer-events-auto flex items-center gap-1 rounded-lg border p-1 shadow-sm'>
      {fixtureAccounts.map((account) => (
        <Button
          key={account.email}
          type='button'
          variant={user?.email === account.email ? 'secondary' : 'tertiary'}
          size='sm'
          className='min-w-26 flex-col items-start px-2 py-1 text-left leading-tight'
          disabled={isSigningIn}
          onClick={() => void signInAsFixture(account.email)}
          title={`Sign in as ${account.label} (${account.apps.join(', ')})`}
        >
          <span>{account.label}</span>
          <span
            className={join(
              'text-[10px]',
              user?.email === account.email
                ? 'text-foreground/70'
                : 'text-muted-foreground',
            )}
          >
            {account.apps.join(' • ')}
          </span>
        </Button>
      ))}
      {user && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          disabled={isSigningIn}
          onClick={() => void auth.signOut()}
          title='Sign out'
        >
          Sign Out
        </Button>
      )}
      {error ? <span className='sr-only'>{error}</span> : null}
    </div>
  );
}
