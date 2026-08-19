import {
  Button,
  DropdownMenu,
  DropdownMenuFactories,
  Input,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';
import { ChevronDown, Google } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useState } from 'react';

import UserAvatar from '@/ui/UserAvatar';
import { useAppCatalog } from '@hooks/useAppCatalog';
import { useAuth } from '@hooks/useAuth';
import { useLocation, useNavigate } from 'react-router-dom';

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
  } = useAuth();
  const { appPathMap } = useAppCatalog();
  const { option, separator, custom } = DropdownMenuFactories;
  const [nameInput, setNameInput] = useState('');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();

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
      <Button onClick={signInWithGoogle} className={join('gap-2', className)} aria-label='Sign in with Google'>
        <Google className='size-4' />
        <span className='hidden sm:inline'>Sign in</span>
      </Button>
    );
  }

  const displayName = user.displayName ?? user.email ?? 'User';
  const normalizedLocationName =
    appPathMap[pathname]?.name?.trim() ||
    (pathname === '/'
      ? 'Home'
      : pathname.replace(/^\//, '').replace(/-/g, ' '));
  const locationLabel = pathname === '/' ? 'Home' : normalizedLocationName;

  const handleNameSave = async () => {
    const nextName = nameInput.trim();
    if (!nextName) {
      return;
    }

    await updateDisplayName(nextName);
    setNameInput('');
    setIsNameModalOpen(false);
  };

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

        <div className='border-border bg-muted/40 text-muted-foreground mt-2 rounded-md border px-2 py-1.5 text-xs'>
          Current location:{' '}
          <span className='text-foreground font-medium'>{locationLabel}</span>
        </div>
      </div>
    )),
    ...(isAdmin ? [option({ label: 'Admin', value: 'admin' })] : []),
    option({ label: 'Profile', value: 'profile' }),
    option({ label: 'Change name', value: 'change-name' }),
    separator(),
    option({ label: 'Sign out', value: 'signout' }),
  ];

  const handleItemSelect = async (value: string) => {
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

    if (value === 'signout') {
      await logOut();
    }
  };

  const createdAt = user.metadata.creationTime;
  const dateFromAuth = createdAt ? new Date(user.metadata.creationTime) : null;
  const formattedDate = dateFromAuth
    ? dateFromAuth.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown';

  return (
    <>
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
        className='w-80'
      />

      <Modal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        title='Profile'
        actions={[
          {
            label: 'Close',
            variant: 'secondary',
            onClick: () => setIsProfileModalOpen(false),
          },
        ]}
      >
        <div className='space-y-3'>
          <p className='text-muted-foreground text-sm'>
            This is your profile information.
          </p>
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
          {/* created at */}
          <div className='text-muted-foreground text-sm'>
            Account created at:{' '}
            <span className='text-foreground font-medium'>{formattedDate}</span>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isNameModalOpen}
        onClose={() => setIsNameModalOpen(false)}
        title='Change display name'
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onClick: () => setIsNameModalOpen(false),
          },
          { label: 'Save', onClick: handleNameSave },
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
