import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import type { User } from 'firebase/auth';
import { ChevronDown, LogOut, Plus, ShieldCheck, UserRoundCog, X } from 'lucide-react';
import { useState } from 'react';

import { VersionLabel } from '@components/VersionLabel';
import type { RememberedAccount } from '@/lib/auth/rememberedAccounts';
import UserAvatar from '@/ui/UserAvatar';

interface AccountPanelProps {
  user: User;
  isAdmin: boolean;
  otherAccounts: RememberedAccount[];
  onSwitch: (account: RememberedAccount | null) => void;
  onManageAccount: () => void;
  onOpenAdmin: () => void;
  onSignOut: () => void;
  /** Draws the panel's own close button; a drawer brings its own, so it leaves this out. */
  onClose?: () => void;
}

const getName = (account: { displayName?: string | null; email?: string | null }) =>
  account.displayName?.trim() || account.email || 'Unnamed account';

const rowClassName =
  'bg-background hover:bg-accent/60 h-auto w-full justify-start gap-4 rounded-none px-5 py-3 text-left font-normal';

// Google's blue, paired for light and dark, so the panel reads as Google's account switcher on every theme.
/**
 * Google-style account panel: a tinted sheet holding the signed-in account, the other accounts on
 * this device to switch to, Add another account and Sign out as one stack of rows, then Manage your account.
 */
function AccountPanel({
  user,
  isAdmin,
  otherAccounts,
  onSwitch,
  onManageAccount,
  onOpenAdmin,
  onSignOut,
  onClose,
}: AccountPanelProps) {
  const [isListOpen, setIsListOpen] = useState(true);
  const hasOthers = otherAccounts.length > 0;

  return (
    <div className='bg-muted space-y-3 rounded-[28px] p-3'>
      <div className='relative flex min-h-10 items-center justify-center px-12'>
        {isAdmin ? (
          <Button type='button' variant='link' size='sm' className='gap-1.5 text-blue-600! dark:text-blue-300!' onClick={onOpenAdmin}>
            <ShieldCheck className='size-4' aria-hidden='true' />
            Admin dashboard
          </Button>
        ) : (
          <p className='text-muted-foreground truncate text-sm'>{user.email}</p>
        )}
        {onClose ? (
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            rounded='full'
            aria-label='Close'
            className='absolute top-0 right-0 size-10'
            onClick={onClose}
          >
            <X className='size-5' />
          </Button>
        ) : null}
      </div>

      <div className='flex flex-col gap-0.5 overflow-hidden rounded-3xl'>
        <div className='bg-background flex items-center gap-4 px-5 py-4'>
          <UserAvatar user={user} size='lg' />
          <div className='min-w-0 flex-1'>
            <p className='text-foreground truncate text-lg'>{getName(user)}</p>
            <p className='text-muted-foreground truncate text-sm'>{user.email}</p>
          </div>
          {hasOthers ? (
            <Button
              type='button'
              variant='secondary'
              size='icon'
              rounded='full'
              aria-label={isListOpen ? 'Hide other accounts' : 'Show other accounts'}
              aria-expanded={isListOpen}
              className="relative size-9 shrink-0 before:absolute before:-inset-0.5 before:content-['']"
              onClick={() => setIsListOpen((open) => !open)}
            >
              <ChevronDown className={join('size-4 transition-transform', isListOpen && 'rotate-180')} />
            </Button>
          ) : null}
        </div>

        {hasOthers && isListOpen
          ? otherAccounts.map((account) => (
              <Button
                key={account.uid}
                type='button'
                variant='tertiary'
                className={rowClassName}
                onClick={() => onSwitch(account)}
              >
                <UserAvatar user={account} size='md' />
                <span className='min-w-0 flex-1'>
                  <span className='text-foreground block truncate text-sm font-medium'>{getName(account)}</span>
                  <span className='text-muted-foreground block truncate text-xs'>{account.email}</span>
                </span>
              </Button>
            ))
          : null}

        <Button type='button' variant='tertiary' className={rowClassName} onClick={() => onSwitch(null)}>
          <span className='grid size-10 shrink-0 place-items-center rounded-full bg-blue-600/10 text-blue-600 dark:bg-blue-300/15 dark:text-blue-300'>
            <Plus className='size-5' />
          </span>
          <span className='text-foreground text-sm font-medium'>Add another account</span>
        </Button>
        <Button type='button' variant='tertiary' className={rowClassName} onClick={onSignOut}>
          <span className='grid size-10 shrink-0 place-items-center'>
            <LogOut className='size-5' />
          </span>
          <span className='text-foreground text-sm font-medium'>Sign out</span>
        </Button>
      </div>

      <Button
        type='button'
        variant='tertiary'
        rounded='full'
        className='bg-background hover:bg-accent/60 h-auto w-full justify-start gap-4 px-5 py-3.5 font-normal'
        onClick={onManageAccount}
      >
        <span className='grid size-10 shrink-0 place-items-center'>
          <UserRoundCog className='size-5' />
        </span>
        <span className='text-foreground text-sm font-medium'>Manage your account</span>
      </Button>

      <div className='text-muted-foreground pb-1 text-center text-xs'>
        <VersionLabel />
      </div>
    </div>
  );
}

export default AccountPanel;
