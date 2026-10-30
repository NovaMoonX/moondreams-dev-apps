import { Button, Input, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import { SubviewHeader } from '@/components/Subview';
import { useAccountSwitch } from '@/hooks/useAccountSwitch';
import { useAuth } from '@/hooks/useAuth';
import { resetFirestoreLocalData } from '@/lib/firebase/localData';
import ChangePhotoModal from '@/ui/ChangePhotoModal';
import DeviceAccountList from '@/ui/DeviceAccountList';
import UserAvatar from '@/ui/UserAvatar';
import { formatDate } from '@/utils/formatUtils';

/** The signed-in account's own page: profile, the accounts on this device, this device's saved data, and sign-out. */
function Account() {
  const { user, loading, logOut, updateDisplayName, isDisplayNameUpdating, rememberedAccounts, forgetAccount } =
    useAuth();
  const switchToAccount = useAccountSwitch();
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to='/' replace />;

  const displayName = user.displayName ?? user.email ?? 'User';
  const memberSince = user.metadata.creationTime ? formatDate(Date.parse(user.metadata.creationTime)) : null;

  const saveName = async () => {
    const nextName = nameDraft?.trim() ?? '';
    if (!nextName) return;
    try {
      await updateDisplayName(nextName);
      setNameDraft(null);
    } catch {
      addToast({ title: "Couldn't save your name", description: 'Check your connection and try again.', type: 'error' });
    }
  };

  const resetSavedData = async () => {
    const isConfirmed = await confirm({
      title: 'Reset saved data',
      message:
        "Clears the copy of your data this device keeps for speed and offline use, then reloads, and any other open windows of the app reload too. Try it if screens look empty or out of date. Your account isn't touched, but anything you changed offline that hasn't synced yet is lost.",
      confirmText: 'Reset and reload',
      destructive: true,
    });
    if (isConfirmed) await resetFirestoreLocalData();
  };

  return (
    <div className='page pt-20'>
      <div className='mx-auto w-full max-w-xl space-y-6'>
        <SubviewHeader title='Your account' onBack={() => (location.key === 'default' ? navigate('/') : navigate(-1))} />

        <div className='flex flex-col items-center gap-2 text-center'>
          <UserAvatar user={user} size='lg' className='size-20! text-2xl' />
          <div className='min-w-0'>
            <p className='text-foreground truncate text-xl font-semibold'>{displayName}</p>
            <p className='text-muted-foreground truncate text-sm'>{user.email}</p>
            {memberSince ? <p className='text-muted-foreground text-xs'>Member since {memberSince}</p> : null}
          </div>
        </div>

        <SettingsGroup title='Profile' description='How you show up to the people you share apps with.'>
          <SettingsRow
            icon='✏️'
            title='Name'
            description={displayName}
            control={
              <Button type='button' variant='secondary' size='sm' onClick={() => setNameDraft(user.displayName ?? '')}>
                Change
              </Button>
            }
          />
          <SettingsRow
            icon='📷'
            title='Photo'
            description='Shown across apps in place of your Google photo.'
            control={
              <Button type='button' variant='secondary' size='sm' onClick={() => setIsPhotoOpen(true)}>
                Change
              </Button>
            }
          />
        </SettingsGroup>

        <section className='space-y-2'>
          <div className='px-1'>
            <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              Accounts on this device
            </h3>
            <p className='text-muted-foreground mt-1 text-sm'>
              Switch between them from your avatar. Signing out keeps an account here until you remove it.
            </p>
          </div>
          <div className='border-border rounded-2xl border px-3'>
            <DeviceAccountList
              accounts={rememberedAccounts}
              currentUid={user.uid}
              onSwitch={switchToAccount}
              onForget={forgetAccount}
            />
          </div>
        </section>

        <SettingsGroup title='This device'>
          <SettingsRow
            icon='🔄'
            title='Reset saved data'
            description='If screens look empty or out of date, this clears what this device kept and reloads.'
            control={
              <Button type='button' variant='secondary' size='sm' onClick={resetSavedData}>
                Reset
              </Button>
            }
          />
        </SettingsGroup>

        <Button type='button' variant='secondary' rounded='full' className='w-full' onClick={() => void logOut()}>
          Sign out
        </Button>
      </div>

      {isPhotoOpen ? <ChangePhotoModal user={user} onClose={() => setIsPhotoOpen(false)} /> : null}

      <Modal
        isOpen={nameDraft !== null}
        onClose={() => setNameDraft(null)}
        title='Change your name'
        actions={[
          { label: 'Cancel', variant: 'secondary', onClick: () => setNameDraft(null), disabled: isDisplayNameUpdating },
          { label: 'Save', onClick: saveName, loading: isDisplayNameUpdating },
        ]}
      >
        <div className='space-y-3'>
          <p className='text-muted-foreground text-sm'>The name you want to show across apps.</p>
          <Input value={nameDraft ?? ''} onChange={(event) => setNameDraft(event.target.value)} placeholder='Your name' />
        </div>
      </Modal>
    </div>
  );
}

export default Account;
