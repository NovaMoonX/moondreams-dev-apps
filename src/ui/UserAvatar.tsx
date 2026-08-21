import { Avatar } from '@moondreamsdev/dreamer-ui/components';

import { getInitials } from '@/utils/accountUtils';

export type UserAvatarData = {
  uid?: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
};

type UserAvatarProps = {
  user?: UserAvatarData | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
};

function UserAvatar({ user, size = 'sm', className }: UserAvatarProps) {
  const displayName = user?.displayName?.trim() || user?.email || '??';
  const initials = user?.photoURL ? undefined : getInitials(displayName);

  return (
    <Avatar
      src={user?.photoURL ?? undefined}
      alt={displayName}
      title={displayName}
      initials={initials}
      size={size}
      shape='circle'
      className={className}
    />
  );
}

export default UserAvatar;
