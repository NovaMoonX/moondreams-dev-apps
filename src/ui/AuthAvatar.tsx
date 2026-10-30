import { Button, Drawer, Popover } from '@moondreamsdev/dreamer-ui/components';
import { ChevronDown, Google } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { House } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAccountSwitch } from '@/hooks/useAccountSwitch';
import type { RememberedAccount } from '@/lib/auth/rememberedAccounts';
import { useSheetHistory } from '@/hooks/useBackHistory';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import AccountPanel from '@/ui/AccountPanel';
import UserAvatar from '@/ui/UserAvatar';
import { useAuth } from '@hooks/useAuth';

type AuthAvatarProps = {
  className?: string;
};

function AuthAvatar({ className }: AuthAvatarProps) {
  const { user, loading, signInWithGoogle, logOut, isAdmin, rememberedAccounts } = useAuth();
  const switchToAccount = useAccountSwitch();
  const { pathname } = useLocation();
  // Tied to the page it opened on, so any navigation (Back, a link elsewhere) closes the card.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const isOpen = openPath === pathname;
  const setIsOpen = (next: boolean | ((open: boolean) => boolean)) =>
    setOpenPath((current) => {
      const nextOpen = typeof next === 'function' ? next(current === pathname) : next;
      return nextOpen ? pathname : null;
    });
  const isPhone = useMediaQuery().isBelow('sm');
  const { dialogId, onDialogClose } = useSheetHistory(isOpen && isPhone, () => setIsOpen(false));
  const navigate = useNavigate();
  const isAwayFromHome = pathname !== '/';

  if (loading) {
    return (
      <Button
        variant='base'
        className={join('pointer-events-none opacity-80', className)}
        disabled
      >
        Loading...
      </Button>
    );
  }

  if (!user) {
    return (
      <div className='flex items-center gap-2'>
        {isAwayFromHome && (
          <Button
            variant='base'
            size='sm'
            aria-label='Home'
            title='Home'
            className="relative after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
            onClick={() => navigate('/')}
          >
            <House className='h-4 w-4' />
          </Button>
        )}
        <Button
          onClick={signInWithGoogle}
          className={join(
            "relative gap-2 after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']",
            className,
          )}
          aria-label='Sign in with Google'
        >
          <Google className='size-4' />
          <span className='hidden sm:inline'>Sign in</span>
        </Button>
      </div>
    );
  }

  const displayName = user.displayName ?? user.email ?? 'User';
  const otherAccounts = rememberedAccounts.filter((account) => account.uid !== user.uid);
  const close = () => setIsOpen(false);
  const goTo = (path: string) => {
    close();
    navigate(path);
  };

  const panelProps = {
    user,
    isAdmin,
    otherAccounts,
    onSwitch: (account: RememberedAccount | null) => {
      close();
      switchToAccount(account);
    },
    onManageAccount: () => goTo('/account'),
    onOpenAdmin: () => goTo('/admin'),
    onSignOut: () => {
      close();
      void logOut();
    },
  };

  const trigger = (
    <Button
      variant='base'
      size='sm'
      aria-label='Your account'
      aria-expanded={isOpen}
      className={join(
        "gap-2 max-sm:relative max-sm:min-w-0 max-sm:px-0 max-sm:after:absolute max-sm:after:-inset-1.5 max-sm:after:content-['']",
        className,
      )}
      onClick={() => setIsOpen((open) => !open)}
    >
      <UserAvatar user={user} size='sm' />
      <span className='hidden sm:inline'>{displayName}</span>
      {isPhone ? null : <ChevronDown className='h-4 w-4' />}
    </Button>
  );

  return (
    <div className='flex items-center gap-2'>
      {isAwayFromHome && (
        <Button
          variant='base'
          size='sm'
          aria-label='Home'
          title='Home'
          className="relative max-sm:hidden after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
          onClick={() => navigate('/')}
        >
          <House className='h-4 w-4' />
        </Button>
      )}
      {isPhone ? (
        <>
          {trigger}
          <Drawer id={dialogId} isOpen={isOpen} onClose={onDialogClose} title='Account' showCloseButton>
            <div className='pb-4'>{isOpen && <AccountPanel {...panelProps} />}</div>
          </Drawer>
        </>
      ) : (
        <Popover
          trigger={trigger}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          placement='bottom'
          alignment='end'
          offset={4}
          className='w-96 max-w-[calc(100vw-1.5rem)] rounded-[28px]! border-0! bg-transparent! p-0! shadow-xl'
        >
          {isOpen && <AccountPanel {...panelProps} onClose={close} />}
        </Popover>
      )}
    </div>
  );
}

export default AuthAvatar;
