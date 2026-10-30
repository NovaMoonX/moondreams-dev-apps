import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Check, UserPlus } from 'lucide-react';

import DeleteIconButton from '@/components/DeleteIconButton';
import { useSheetHistory } from '@/hooks/useBackHistory';
import type { RememberedAccount } from '@/lib/auth/rememberedAccounts';
import UserAvatar from '@/ui/UserAvatar';

interface DeviceAccountsSheetProps {
  isOpen: boolean;
  accounts: RememberedAccount[];
  currentUid: string;
  onSwitch: (account: RememberedAccount | null) => void;
  onForget: (uid: string) => void;
  onClose: () => void;
}

const getName = (account: RememberedAccount) => account.displayName?.trim() || account.email || 'Unnamed account';

/** Google-style account chooser: tap an account to switch to it, the trash icon to remove it from this device, or add another. */
function DeviceAccountsSheet({ isOpen, accounts, currentUid, onSwitch, onForget, onClose }: DeviceAccountsSheetProps) {
  const { confirm } = useActionModal();
  const { dialogId, onDialogClose } = useSheetHistory(isOpen, onClose);

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
    <Drawer id={dialogId} isOpen={isOpen} onClose={onDialogClose} title='Accounts' showCloseButton>
      <div className='space-y-1 pb-4'>
        <ul className='space-y-1'>
          {accounts.map((account) => {
            const isCurrent = account.uid === currentUid;
            return (
              <li key={account.uid} className='flex items-center gap-1'>
                <Button
                  type='button'
                  variant='tertiary'
                  aria-current={isCurrent ? 'true' : undefined}
                  disabled={isCurrent}
                  className='h-auto min-w-0 flex-1 justify-start gap-3 rounded-2xl px-2 py-2.5 text-left font-normal disabled:opacity-100'
                  onClick={() => onSwitch(account)}
                >
                  <UserAvatar user={account} size='md' />
                  <span className='min-w-0 flex-1'>
                    <span className='text-foreground block truncate text-sm font-medium'>{getName(account)}</span>
                    <span className='text-muted-foreground block truncate text-xs'>{account.email}</span>
                  </span>
                  {isCurrent ? <Check className='text-primary size-5 shrink-0' aria-label='Signed in' /> : null}
                </Button>
                {isCurrent ? (
                  <span className='size-10 shrink-0' />
                ) : (
                  <DeleteIconButton label={`Remove ${getName(account)} from this device`} onClick={() => handleForget(account)} />
                )}
              </li>
            );
          })}
        </ul>
        <div className='border-border border-t pt-1'>
          <Button
            type='button'
            variant='tertiary'
            className='h-auto w-full justify-start gap-3 rounded-2xl px-2 py-3 text-left font-normal'
            onClick={() => onSwitch(null)}
          >
            <span className='bg-muted grid size-10 shrink-0 place-items-center rounded-full'>
              <UserPlus className='size-5' />
            </span>
            <span className='text-foreground text-sm font-medium'>Add another account</span>
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

export default DeviceAccountsSheet;
