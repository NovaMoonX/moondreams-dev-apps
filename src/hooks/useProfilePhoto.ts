import { useAuth } from '@/hooks/useAuth';
import { useStoragePhoto } from '@/hooks/useStoragePhoto';
import { getAvatarStoragePath, getProviderPhotoURL } from '@/utils/accountUtils';

/** Create/replace/delete the signed-in user's custom photo, which overrides the sign-in provider's photo. */
export function useProfilePhoto() {
  const { user, updatePhotoURL } = useAuth();
  const storage = useStoragePhoto(getAvatarStoragePath(user?.uid ?? 'anonymous'));

  const providerPhotoURL = user ? getProviderPhotoURL(user) : null;
  const customPhotoURL =
    user?.photoURL?.includes(encodeURIComponent(getAvatarStoragePath(user.uid)))
      ? user.photoURL
      : null;

  const save = (file: File) =>
    storage.track(async () => {
      const url = await storage.upload(file);
      await updatePhotoURL(url);
    });

  const remove = () =>
    storage.track(async () => {
      await storage.remove();
      await updatePhotoURL(null);
    });

  return {
    customPhotoURL,
    providerPhotoURL,
    isWorking: storage.isWorking,
    error: storage.error,
    save,
    remove,
  };
}
