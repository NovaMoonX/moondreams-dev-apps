import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import type { User } from 'firebase/auth';
import { ChevronDown, LogOut, Plus, ShieldCheck } from 'lucide-react';
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
}

const getName = (account: { displayName?: string | null; email?: string | null }) =>
  account.displayName?.trim() || account.email || 'Unnamed account';

/** Google-style account card: who is signed in, the other accounts on this device to switch to, add, sign out, and the way into the account page. */
function AccountPanel({
  user,
  isAdmin,
  otherAccounts,
  onSwitch,
  onManageAccount,
  onOpenAdmin,
  onSignOut,
}: AccountPanelProps) {
  const [isListOpen, setIsListOpen] = useState(true);
  const hasOthers = otherAccounts.length > 0;
  const rowClassName = 'h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left font-normal';

  return (
    <div className='space-y-3'>
      {isAdmin ? (
        <div className='flex justify-center'>
          <Button type='button' variant='link' size='sm' className='gap-1.5' onClick={onOpenAdmin}>
            <ShieldCheck className='size-4' aria-hidden='true' />
            Admin dashboard
          </Button>
        </div>
      ) : null}

      <div className='border-border bg-card divide-border divide-y overflow-hidden rounded-3xl border'>
        <div className='flex items-center gap-3 px-4 py-4'>
          <UserAvatar user={user} size='lg' />
          <div className='min-w-0 flex-1'>
            <p className='text-foreground truncate text-base font-semibold'>{getName(user)}</p>
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
          <span className='text-primary grid size-10 shrink-0 place-items-center'>
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

      <Button type='button' variant='outline' rounded='full' className='w-full' onClick={onManageAccount}>
        Manage your account
      </Button>

      <div className='text-muted-foreground text-center text-xs'>
        <VersionLabel />
      </div>
    </div>
  );
}

export default AccountPanel;
