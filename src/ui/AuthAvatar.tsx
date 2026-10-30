import {
  Button,
  DropdownMenu,
  DropdownMenuFactories,
  Input,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronDown, Google } from '@moondreamsdev/dreamer-ui/symbols';
import { Camera, House, LogOut, Pencil, RefreshCw, ShieldCheck, UserPlus, UserRound, Users } from 'lucide-react';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useState } from 'react';

import { resetFirestoreLocalData } from '@/lib/firebase/localData';
import type { RememberedAccount } from '@/lib/auth/rememberedAccounts';
import ChangePhotoModal from '@/ui/ChangePhotoModal';
import DeviceAccountsSheet from '@/ui/DeviceAccountsSheet';
import ProfileModal from '@/ui/ProfileModal';
import UserAvatar from '@/ui/UserAvatar';
import FallbackImage from '@components/FallbackImage';
import { VersionLabel } from '@components/VersionLabel';
import { useAuth } from '@hooks/useAuth';
import { useLocation, useNavigate } from 'react-router-dom';

/** A name, or the email where two accounts on the device share that name. */
function getAccountLabel(account: RememberedAccount, accounts: RememberedAccount[]) {
  const name = account.displayName?.trim() || null;
  const isShared = accounts.some((other) => other.uid !== account.uid && other.displayName?.trim() === name);
  return (isShared || !name ? account.email : name) ?? 'another account';
}

type AuthAvatarProps = {
  className?: string;
};

function AuthAvatar({ className }: AuthAvatarProps) {
  const {
    user,
    loading,
    signInWithGoogle,
    logOut,
    updateDisplayName,
    isAdmin,
    isDisplayNameUpdating,
    rememberedAccounts,
    switchAccount,
    forgetAccount,
  } = useAuth();
  const { addToast } = useToast();
  const [isAccountsSheetOpen, setIsAccountsSheetOpen] = useState(false);
  const { option, separator, custom } = DropdownMenuFactories;
  const [nameInput, setNameInput] = useState('');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { confirm } = useActionModal();
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

  const handleNameSave = async () => {
    const nextName = nameInput.trim();
    if (!nextName) {
      return;
    }

    await updateDisplayName(nextName);
    setNameInput('');
    setIsNameModalOpen(false);
  };

  const otherAccounts = rememberedAccounts.filter((account) => account.uid !== user.uid);

  const handleSwitch = (account: RememberedAccount | null) => {
    switchAccount(account?.email ?? null).catch((error: unknown) =>
      addToast({
        title: "Couldn't switch accounts",
        description: error instanceof Error ? error.message : 'Please try again.',
        type: 'error',
      }),
    );
  };

  const accountItems = [
    ...otherAccounts.map((account) =>
      option({
        label: `Switch to ${getAccountLabel(account, otherAccounts)}`,
        value: `switch:${account.uid}`,
        icon: account.photoURL ? (
          <FallbackImage
            src={account.photoURL}
            alt=''
            className='size-4 rounded-full object-cover'
            fallback={<UserRound className='size-4' />}
          />
        ) : (
          <UserRound className='size-4' />
        ),
      }),
    ),
    option({ label: 'Add another account', value: 'add-account', icon: <UserPlus className='size-4' /> }),
    ...(otherAccounts.length > 0
      ? [option({ label: 'Manage accounts', value: 'device-accounts', icon: <Users className='size-4' /> })]
      : []),
    separator(),
  ];

  const navItems = [
    ...(isAdmin ? [option({ label: 'Admin', value: 'admin', icon: <ShieldCheck className='size-4' /> })] : []),
  ];

  const menuItems = [
    custom(() => (
      <div className='border-border border-b px-3 py-2'>
        <div className='flex items-center gap-3'>
          <UserAvatar user={user} size='md' />
          <div className='min-w-0'>
            <div className='text-foreground truncate text-sm font-medium'>
              {displayName}
            </div>
            <div className='text-muted-foreground truncate text-xs'>
              {user.email}
            </div>
          </div>
        </div>
      </div>
    )),
    ...accountItems,
    ...navItems,
    ...(navItems.length > 0 ? [separator()] : []),
    option({ label: 'Profile', value: 'profile', icon: <UserRound className='size-4' /> }),
    option({ label: 'Change name', value: 'change-name', icon: <Pencil className='size-4' /> }),
    option({ label: 'Change photo', value: 'change-photo', icon: <Camera className='size-4' /> }),
    option({ label: 'Reset saved data', value: 'reset-local-data', icon: <RefreshCw className='size-4' /> }),
    separator(),
    option({ label: 'Sign out', value: 'signout', icon: <LogOut className='size-4' /> }),
    custom(() => (
      <div className='border-border text-muted-foreground mt-1 border-t px-3 py-2 text-xs text-right'>
        <VersionLabel />
      </div>
    )),
  ];

  const handleItemSelect = async (value: string) => {
    if (value.startsWith('switch:')) {
      handleSwitch(otherAccounts.find((account) => `switch:${account.uid}` === value) ?? null);
      return;
    }
    if (value === 'add-account') {
      handleSwitch(null);
      return;
    }
    if (value === 'device-accounts') {
      setIsAccountsSheetOpen(true);
      return;
    }
    if (value === 'admin') {
      navigate('/admin');
      return;
    }
    if (value === 'profile') {
      setIsProfileModalOpen(true);
      return;
    }
    if (value === 'change-name') {
      setNameInput(displayName);
      setIsNameModalOpen(true);
      return;
    }

    if (value === 'change-photo') {
      setIsPhotoModalOpen(true);
      return;
    }

    if (value === 'reset-local-data') {
      const confirmed = await confirm({
        title: 'Reset saved data',
        message:
          "Clears the copy of your data this device keeps for speed and offline use, then reloads, and any other open windows of the app reload too. Try it if screens look empty or out of date. Your account isn't touched, but anything you changed offline that hasn't synced yet is lost.",
        confirmText: 'Reset and reload',
        destructive: true,
      });
      if (confirmed) {
        await resetFirestoreLocalData();
      }
      return;
    }

    if (value === 'signout') {
      await logOut();
    }
  };

  return (
    <>
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
        <DropdownMenu
          items={menuItems}
          onItemSelect={handleItemSelect}
          placement='bottom'
          alignment='end'
          offset={12}
          trigger={
            <Button variant='base' size='sm' className={join('gap-2', className)}>
              <UserAvatar user={user} size='sm' />
              <span className='hidden sm:inline'>{displayName}</span>
              <ChevronDown className='h-4 w-4' />
            </Button>
          }
          className='w-80 max-w-[calc(100vw-1.5rem)]'
        />
      </div>

      {isProfileModalOpen && (
        <ProfileModal user={user} onClose={() => setIsProfileModalOpen(false)} />
      )}

      <DeviceAccountsSheet
        isOpen={isAccountsSheetOpen}
        accounts={rememberedAccounts}
        currentUid={user.uid}
        onSwitch={(account) => {
          setIsAccountsSheetOpen(false);
          handleSwitch(account);
        }}
        onForget={forgetAccount}
        onClose={() => setIsAccountsSheetOpen(false)}
      />

      {isPhotoModalOpen && (
        <ChangePhotoModal user={user} onClose={() => setIsPhotoModalOpen(false)} />
      )}

      <Modal
        isOpen={isNameModalOpen}
        onClose={() => setIsNameModalOpen(false)}
        title='Change display name'
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onClick: () => setIsNameModalOpen(false),
            disabled: isDisplayNameUpdating,
          },
          {
            label: 'Save',
            onClick: handleNameSave,
            loading: isDisplayNameUpdating,
          },
        ]}
      >
        <div className='space-y-3'>
          <p className='text-muted-foreground text-sm'>
            Choose the name you want to appear across apps.
          </p>
          <Input
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder='Your display name'
          />
        </div>
      </Modal>
    </>
  );
}

export default AuthAvatar;
