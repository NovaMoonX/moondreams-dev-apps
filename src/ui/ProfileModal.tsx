import { Modal } from '@moondreamsdev/dreamer-ui/components';
import type { User } from 'firebase/auth';

import UserAvatar from '@/ui/UserAvatar';
import { formatDate } from '@/utils/formatUtils';

interface ProfileModalProps {
  user: User;
  onClose: () => void;
}

function ProfileModal({ user, onClose }: ProfileModalProps) {
  const displayName = user.displayName ?? user.email ?? 'User';
  const formattedDate = user.metadata.creationTime
    ? formatDate(Date.parse(user.metadata.creationTime))
    : 'Unknown';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title='Profile'
      actions={[{ label: 'Close', variant: 'secondary', onClick: onClose }]}
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
        <div className='text-muted-foreground text-sm'>
          Account created at:{' '}
          <span className='text-foreground font-medium'>{formattedDate}</span>
        </div>
      </div>
    </Modal>
  );
}

export default ProfileModal;
