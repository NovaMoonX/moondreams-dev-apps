import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import type { RememberedAccount } from '@/lib/auth/rememberedAccounts';
import UserAvatar from '@/ui/UserAvatar';

interface DeviceAccountsModalProps {
  accounts: RememberedAccount[];
  currentUid: string;
  onSwitch: (account: RememberedAccount) => void;
  onForget: (uid: string) => void;
  onClose: () => void;
}

const getName = (account: RememberedAccount) => account.displayName?.trim() || account.email || 'Unnamed account';

/** The accounts this device remembers: switch to one, or remove it and what the device kept for it. */
function DeviceAccountsModal({ accounts, currentUid, onSwitch, onForget, onClose }: DeviceAccountsModalProps) {
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
    <Modal isOpen onClose={onClose} title='Accounts on this device'>
      <ul className='divide-border divide-y'>
        {accounts.map((account) => {
          const isCurrent = account.uid === currentUid;
          return (
            <li key={account.uid} className='flex items-center gap-3 py-3'>
              <UserAvatar user={account} size='md' />
              <div className='min-w-0 flex-1'>
                <p className='text-foreground truncate text-sm font-medium'>{getName(account)}</p>
                <p className='text-muted-foreground truncate text-xs'>{isCurrent ? 'Signed in now' : account.email}</p>
              </div>
              {isCurrent ? null : (
                <div className='flex shrink-0 gap-2'>
                  <Button type='button' size='sm' variant='secondary' onClick={() => onSwitch(account)}>
                    Switch
                  </Button>
                  <Button type='button' size='sm' variant='tertiary' onClick={() => handleForget(account)}>
                    Remove
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

export default DeviceAccountsModal;
