import { Button, Drawer, Popover } from '@moondreamsdev/dreamer-ui/components';
import { ChevronDown, Google } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { House } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAccountSwitch } from '@/hooks/useAccountSwitch';
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
  const [isOpen, setIsOpen] = useState(false);
  const isPhone = useMediaQuery().isBelow('sm');
  const { dialogId, onDialogClose } = useSheetHistory(isOpen && isPhone, () => setIsOpen(false));
  const { pathname } = useLocation();
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

  const panel = (
    <AccountPanel
      user={user}
      isAdmin={isAdmin}
      otherAccounts={otherAccounts}
      onSwitch={(account) => {
        close();
        switchToAccount(account);
      }}
      onManageAccount={() => goTo('/account')}
      onOpenAdmin={() => goTo('/admin')}
      onSignOut={() => {
        close();
        void logOut();
      }}
    />
  );

  const trigger = (
    <Button
      variant='base'
      size='sm'
      aria-label='Your account'
      aria-expanded={isOpen}
      className={join('gap-2', className)}
      onClick={() => setIsOpen((open) => !open)}
    >
      <UserAvatar user={user} size='sm' />
      <span className='hidden sm:inline'>{displayName}</span>
      <ChevronDown className='h-4 w-4' />
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
            <div className='pb-4'>{isOpen && panel}</div>
          </Drawer>
        </>
      ) : (
        <Popover
          trigger={trigger}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          placement='bottom'
          alignment='end'
          offset={12}
          className='w-96 max-w-[calc(100vw-1.5rem)] p-4'
        >
          {isOpen && panel}
        </Popover>
      )}
    </div>
  );
}

export default AuthAvatar;
