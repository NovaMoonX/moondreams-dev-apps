import { Modal } from '@moondreamsdev/dreamer-ui/components';
import type { User } from 'firebase/auth';

import PhotoPicker from '@/components/forms/PhotoPicker';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useProfilePhoto } from '@/hooks/useProfilePhoto';
import { getInitials } from '@/utils/accountUtils';
import { formatDate } from '@/utils/formatUtils';

interface ProfileModalProps {
  user: User;
  onClose: () => void;
}

/** Rendered only while open so the staged photo resets each time. */
function ProfileModal({ user, onClose }: ProfileModalProps) {
  const profilePhoto = useProfilePhoto();
  const photoUpload = useImageUpload(profilePhoto.customPhotoURL);
  const displayName = user.displayName ?? user.email ?? 'User';
  const hasChange =
    Boolean(photoUpload.file) ||
    (photoUpload.previewUrl === null && Boolean(profilePhoto.customPhotoURL));

  const formattedDate = user.metadata.creationTime
    ? formatDate(Date.parse(user.metadata.creationTime))
    : 'Unknown';

  const handleSave = async () => {
    try {
      if (photoUpload.file) {
        await profilePhoto.save(photoUpload.file);
      } else {
        await profilePhoto.remove();
      }
      onClose();
    } catch {
      return;
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title='Profile'
      actions={[
        {
          label: 'Cancel',
          variant: 'secondary',
          onClick: onClose,
          disabled: profilePhoto.isWorking,
        },
        {
          label: 'Save',
          onClick: handleSave,
          disabled: !hasChange,
          loading: profilePhoto.isWorking,
        },
      ]}
    >
      <div className='space-y-4'>
        <PhotoPicker
          variant='enhanced'
          photoUrl={photoUpload.previewUrl}
          fallbackUrl={profilePhoto.providerPhotoURL}
          initials={getInitials(displayName)}
          error={photoUpload.error ?? profilePhoto.error}
          loading={profilePhoto.isWorking}
          onSelect={photoUpload.pick}
          onRemove={photoUpload.clear}
        />
        <div className='text-center'>
          <div className='text-foreground truncate text-sm font-medium'>
            {displayName}
          </div>
          <div className='text-muted-foreground truncate text-xs'>
            {user.email}
          </div>
        </div>
        <div className='text-muted-foreground text-center text-sm'>
          Account created at:{' '}
          <span className='text-foreground font-medium'>{formattedDate}</span>
        </div>
      </div>
    </Modal>
  );
}

export default ProfileModal;
