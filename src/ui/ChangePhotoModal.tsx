import { Modal } from '@moondreamsdev/dreamer-ui/components';
import type { User } from 'firebase/auth';

import PhotoPicker from '@/components/forms/PhotoPicker';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useProfilePhoto } from '@/hooks/useProfilePhoto';
import { getInitials } from '@/utils/accountUtils';

interface ChangePhotoModalProps {
  user: User;
  onClose: () => void;
}

/** Rendered only while open so the staged photo resets each time. */
function ChangePhotoModal({ user, onClose }: ChangePhotoModalProps) {
  const profilePhoto = useProfilePhoto();
  const photoUpload = useImageUpload(profilePhoto.customPhotoURL);
  const displayName = user.displayName ?? user.email ?? 'User';
  const hasChange =
    Boolean(photoUpload.file) ||
    (photoUpload.previewUrl === null && Boolean(profilePhoto.customPhotoURL));

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
      title='Profile photo'
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
      <div className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          Pick a photo that shows up across apps instead of your account photo.
        </p>
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
      </div>
    </Modal>
  );
}

export default ChangePhotoModal;
