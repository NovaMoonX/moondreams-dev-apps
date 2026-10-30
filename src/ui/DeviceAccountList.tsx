import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Check, Plus } from 'lucide-react';

import DeleteIconButton from '@/components/DeleteIconButton';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import {
  getRememberedPhoto,
  type RememberedAccount,
} from '@/lib/auth/rememberedAccounts';
import UserAvatar from '@/ui/UserAvatar';

interface DeviceAccountListProps {
  accounts: RememberedAccount[];
  currentUid: string;
  onSwitch: (account: RememberedAccount | null) => void;
  onForget: (uid: string) => void;
}

const getName = (account: RememberedAccount) =>
  account.displayName?.trim() || account.email || 'Unnamed account';

/** The accounts this device remembers, as a settings section: tap one to switch to it, the trash icon to remove it from this device, or add another. */
function DeviceAccountList({
  accounts,
  currentUid,
  onSwitch,
  onForget,
}: DeviceAccountListProps) {
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
    <SettingsGroup
      isCard
      title='Accounts on this device'
      description='Switch between them from your avatar. Signing out keeps an account here until you remove it.'
    >
      {accounts.map((account) =>
        account.uid === currentUid ? (
          <SettingsRow
            key={account.uid}
            icon={
              <UserAvatar
                user={{ ...account, photoURL: getRememberedPhoto(account) }}
                size='sm'
                className='size-10!'
              />
            }
            title={getName(account)}
            description='Signed in now'
            control={
              <span
                className='grid size-10 place-items-center'
                aria-label='Signed in'
              >
                <Check className='text-primary size-5' aria-hidden='true' />
              </span>
            }
          />
        ) : (
          <SettingsRow
            key={account.uid}
            icon={
              <UserAvatar
                user={{ ...account, photoURL: getRememberedPhoto(account) }}
                size='sm'
                className='size-10!'
              />
            }
            title={getName(account)}
            description={account.email}
            onClick={() => onSwitch(account)}
            control={
              <DeleteIconButton
                label={`Remove ${getName(account)} from this device`}
                onClick={() => handleForget(account)}
              />
            }
          />
        ),
      )}
      <SettingsRow
        icon={<Plus className='size-5' />}
        title='Add another account'
        onClick={() => onSwitch(null)}
      />
    </SettingsGroup>
  );
}

export default DeviceAccountList;
