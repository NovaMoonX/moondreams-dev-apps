import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Google } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAuth } from '@hooks/useAuth';

type AuthAvatarProps = {
  className?: string;
};

function AuthAvatar({ className }: AuthAvatarProps) {
  const { user, loading, signInWithGoogle, logOut } = useAuth();

  if (loading) {
    return (
      <Button className={join('pointer-events-none opacity-80', className)} disabled>
        Loading...
      </Button>
    );
  }

  if (!user) {
    return (
      <Button type='button' onClick={signInWithGoogle} className={join('gap-2', className)}>
        <Google className='size-4' />
        Sign in
      </Button>
    );
  }

  const displayName = user.displayName ?? user.email ?? 'MoonDreams User';
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || '??';

  return (
    <div className={join('flex items-center gap-3', className)}>
      <Button type='button' onClick={logOut} className='gap-2'>
        <div className='flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 text-[10px] font-bold text-white'>
          {user.photoURL ? (
            <img src={user.photoURL} alt={displayName} className='h-full w-full object-cover' />
          ) : (
            initials
          )}
        </div>
        <span className='hidden sm:inline'>{displayName}</span>
      </Button>
    </div>
  );
}

export default AuthAvatar;
