import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuFactories,
  Input,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';
import { ChevronDown, Google } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useState } from 'react';

import { APP_CATALOG_PATH_MAP } from '@/lib/app';
import { useAuth } from '@hooks/useAuth';
import { useLocation } from 'react-router-dom';

type AuthAvatarProps = {
  className?: string;
};

function AuthAvatar({ className }: AuthAvatarProps) {
  const { user, loading, signInWithGoogle, logOut, updateDisplayName } =
    useAuth();
  const { option, separator, custom } = DropdownMenuFactories;
  const [nameInput, setNameInput] = useState('');
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const { pathname } = useLocation();

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
      <Button onClick={signInWithGoogle} className={join('gap-2', className)}>
        <Google className='size-4' />
        Sign in
      </Button>
    );
  }

  const displayName = user.displayName ?? user.email ?? 'MoonDreams User';
  const locationLabel =
    pathname === '/'
      ? 'Home'
      : (APP_CATALOG_PATH_MAP[pathname]?.name ?? 'Unknown');
  const initials =
    displayName
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || '??';

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
          <Avatar
            src={user.photoURL ?? undefined}
            alt={displayName}
            initials={user.photoURL ? undefined : initials}
            size='md'
            shape='circle'
          />
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
    option({ label: 'Profile', value: 'profile' }),
    option({ label: 'Change name', value: 'change-name' }),
    separator(),
    option({ label: 'Sign out', value: 'signout' }),
  ];

  const handleItemSelect = async (value: string) => {
    if (value === 'change-name') {
      setNameInput(displayName);
      setIsNameModalOpen(true);
      return;
    }

    if (value === 'signout') {
      await logOut();
    }
  };

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
            <Avatar
              src={user.photoURL ?? undefined}
              alt={displayName}
              initials={user.photoURL ? undefined : initials}
              size='sm'
              shape='circle'
            />
            <span className='hidden sm:inline'>{displayName}</span>
            <ChevronDown className='h-4 w-4' />
          </Button>
        }
        className='w-80'
      />

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
            Choose the name you want to appear in MoonDreams.
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
