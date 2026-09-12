import {
  Button,
  DropdownMenu,
  DropdownMenuFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { Check, ChevronDown } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import {
  FIXTURE_PASSWORD,
  FIXTURE_USERS,
  FixtureAccount,
} from '@lib/dev/fixtureAccounts';
import { auth, isUsingFirebaseEmulators } from '@lib/firebase/config';

const adminAccount = FIXTURE_USERS.admin;
const appAccounts = Object.values(FIXTURE_USERS).filter(
  (account) => account !== adminAccount,
);

export function DevAccountSwitcher() {
  const { user } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string>();
  const { option, group, separator } = DropdownMenuFactories;

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

  const toAccountOption = (account: FixtureAccount) =>
    option({
      label: account.displayName,
      description: account.apps.join(' • '),
      value: account.email,
      icon: user?.email === account.email ? <Check /> : undefined,
    });

  const menuItems = [
    group([toAccountOption(adminAccount)], 'Admin'),
    separator(),
    group(appAccounts.map(toAccountOption), 'App Accounts'),
    ...(user
      ? [separator(), option({ label: 'Sign out', value: 'signout' })]
      : []),
  ];

  const handleItemSelect = (value: string) => {
    if (value === 'signout') {
      void auth.signOut();
      return;
    }

    void signInAsFixture(value);
  };

  const currentAccount = Object.values(FIXTURE_USERS).find(
    (account) => account.email === user?.email,
  );

  return (
    <div className='pointer-events-auto'>
      <DropdownMenu
        items={menuItems}
        onItemSelect={handleItemSelect}
        placement='bottom'
        alignment='center'
        offset={12}
        trigger={
          <Button
            type='button'
            variant='base'
            size='sm'
            className={join(
              'gap-2',
              isSigningIn && 'pointer-events-none opacity-70',
            )}
            disabled={isSigningIn}
          >
            <span className='hidden sm:inline'>
              {currentAccount ? currentAccount.label : 'Dev sign-in'}
            </span>
            <span className='sm:hidden'>Dev</span>
            <ChevronDown className='h-4 w-4' />
          </Button>
        }
        className='w-64'
      />

      {error ? <span className='sr-only'>{error}</span> : null}
    </div>
  );
}
