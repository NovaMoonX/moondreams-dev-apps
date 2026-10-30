import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Check, UserPlus } from 'lucide-react';

import DeleteIconButton from '@/components/DeleteIconButton';
import type { RememberedAccount } from '@/lib/auth/rememberedAccounts';
import UserAvatar from '@/ui/UserAvatar';

interface DeviceAccountListProps {
  accounts: RememberedAccount[];
  currentUid: string;
  onSwitch: (account: RememberedAccount | null) => void;
  onForget: (uid: string) => void;
}

const getName = (account: RememberedAccount) => account.displayName?.trim() || account.email || 'Unnamed account';

/** The accounts this device remembers: tap one to switch to it, the trash icon to remove it from this device, or add another. */
function DeviceAccountList({ accounts, currentUid, onSwitch, onForget }: DeviceAccountListProps) {
  const { confirm } = useActionModal();

  const handleForget = async (account: RememberedAccount) => {
    const isConfirmed = await confirm({
      title: `Remove ${account.email ?? getName(account)}?`,
      message:
        'It leaves this list, along with the drafts and view choices this device kept for it. The account itself is untouched, and you can add it back any time.',
      confirmText: 'Remove from this device',
      destructive: true,
    });
    if (isConfirmed) onForget(account.uid);
  };

  return (
    <ul className='divide-border divide-y'>
      {accounts.map((account) => {
        const isCurrent = account.uid === currentUid;
        return (
          <li key={account.uid} className='flex items-center gap-1 py-1'>
            <Button
              type='button'
              variant='tertiary'
              aria-current={isCurrent ? 'true' : undefined}
              disabled={isCurrent}
              className='h-auto min-w-0 flex-1 justify-start gap-3 rounded-2xl px-1 py-2 text-left font-normal disabled:opacity-100'
              onClick={() => onSwitch(account)}
            >
              <UserAvatar user={account} size='md' />
              <span className='min-w-0 flex-1'>
                <span className='text-foreground block truncate text-sm font-medium'>{getName(account)}</span>
                <span className='text-muted-foreground block truncate text-xs'>
                  {isCurrent ? 'Signed in now' : account.email}
                </span>
              </span>
              {isCurrent ? <Check className='text-primary size-5 shrink-0' aria-hidden='true' /> : null}
            </Button>
            {isCurrent ? (
              <span className='size-10 shrink-0' />
            ) : (
              <DeleteIconButton
                label={`Remove ${getName(account)} from this device`}
                onClick={() => handleForget(account)}
              />
            )}
          </li>
        );
      })}
      <li className='py-1'>
        <Button
          type='button'
          variant='tertiary'
          className='h-auto w-full justify-start gap-3 rounded-2xl px-1 py-2 text-left font-normal'
          onClick={() => onSwitch(null)}
        >
          <span className='bg-muted grid size-10 shrink-0 place-items-center rounded-full'>
            <UserPlus className='size-5' />
          </span>
          <span className='text-foreground text-sm font-medium'>Add another account</span>
        </Button>
      </li>
    </ul>
  );
}

export default DeviceAccountList;
