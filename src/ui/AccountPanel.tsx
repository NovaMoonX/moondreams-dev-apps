import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import type { User } from 'firebase/auth';
import {
  ChevronDown,
  LogOut,
  Plus,
  ShieldCheck,
  UserRoundCog,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { VersionLabel } from '@components/VersionLabel';
import IconTile from '@/ui/IconTile';
import { CANVAS_CLASS, LIST_CARD_CLASS, SURFACE_CLASS } from '@/ui/siteSurface';
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

const getName = (account: {
  displayName?: string | null;
  email?: string | null;
}) => account.displayName?.trim() || account.email || 'Unnamed account';

const rowClassName =
  'hover:bg-accent/60 h-auto min-h-14 w-full justify-start gap-3 rounded-none bg-transparent px-4 py-2 text-left font-normal';

/** One row of a card: an icon tile or avatar, then its words. */
function PanelRow({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string | null;
  onClick: () => void;
}) {
  return (
    <li>
      <Button
        type='button'
        variant='tertiary'
        className={rowClassName}
        onClick={onClick}
      >
        {icon}
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block truncate text-sm font-medium'>
            {title}
          </span>
          {subtitle ? (
            <span className='text-muted-foreground block truncate text-xs'>
              {subtitle}
            </span>
          ) : null}
        </span>
      </Button>
    </li>
  );
}

/**
 * The account card: the signed-in account, then the other accounts on this device with Add another
 * account and Sign out as one card of rows, then Manage your account (and the admin link) as another.
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
    <div className={join(CANVAS_CLASS, 'space-y-3 rounded-3xl p-3')}>
      {onClose ? (
        <div className='flex min-h-10 items-center justify-end'>
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            rounded='full'
            aria-label='Close'
            className='size-10'
            onClick={onClose}
          >
            <X className='size-5' />
          </Button>
        </div>
      ) : null}

      <div
        className={join(
          SURFACE_CLASS,
          'border-border/60 flex items-center gap-4 rounded-2xl border px-4 py-4 shadow-sm',
        )}
      >
        <UserAvatar user={user} size='lg' />
        <div className='min-w-0 flex-1'>
          <p className='text-foreground truncate text-lg font-semibold'>
            {getName(user)}
          </p>
          <p className='text-muted-foreground truncate text-sm'>{user.email}</p>
        </div>
        {hasOthers ? (
          <Button
            type='button'
            variant='secondary'
            size='icon'
            rounded='full'
            aria-label={
              isListOpen ? 'Hide other accounts' : 'Show other accounts'
            }
            aria-expanded={isListOpen}
            className="relative size-9 shrink-0 before:absolute before:-inset-0.5 before:content-['']"
            onClick={() => setIsListOpen((open) => !open)}
          >
            <ChevronDown
              className={join(
                'size-4 transition-transform',
                isListOpen && 'rotate-180',
              )}
            />
          </Button>
        ) : null}
      </div>

      <ul className={LIST_CARD_CLASS}>
        {hasOthers && isListOpen
          ? otherAccounts.map((account) => (
              <PanelRow
                key={account.uid}
                icon={<UserAvatar user={account} size='md' />}
                title={getName(account)}
                subtitle={account.email}
                onClick={() => onSwitch(account)}
              />
            ))
          : null}
        <PanelRow
          icon={
            <IconTile>
              <Plus className='size-5' />
            </IconTile>
          }
          title='Add another account'
          onClick={() => onSwitch(null)}
        />
        <PanelRow
          icon={
            <IconTile>
              <LogOut className='size-5' />
            </IconTile>
          }
          title='Sign out'
          onClick={onSignOut}
        />
      </ul>

      <ul className={LIST_CARD_CLASS}>
        <PanelRow
          icon={
            <IconTile>
              <UserRoundCog className='size-5' />
            </IconTile>
          }
          title='Manage your account'
          onClick={onManageAccount}
        />
        {isAdmin ? (
          <PanelRow
            icon={
              <IconTile>
                <ShieldCheck className='size-5' />
              </IconTile>
            }
            title='Admin dashboard'
            onClick={onOpenAdmin}
          />
        ) : null}
      </ul>

      <div className='text-muted-foreground pb-1 text-center text-xs'>
        <VersionLabel />
      </div>
    </div>
  );
}

export default AccountPanel;
