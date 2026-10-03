import { useAuth } from '@/hooks/useAuth';
import { useStoragePhoto } from '@/hooks/useStoragePhoto';

/** Create/replace/delete the signed-in user's custom photo, which overrides the sign-in provider's photo. */
export function useProfilePhoto() {
  const { user, updatePhotoURL } = useAuth();
  const storage = useStoragePhoto(`users/${user?.uid ?? 'anonymous'}/avatar`);

  const providerPhotoURL =
    user?.providerData.find((info) => info.photoURL)?.photoURL ?? null;
  const customPhotoURL =
    user?.photoURL && user.photoURL !== providerPhotoURL ? user.photoURL : null;

  const save = async (file: File) => {
    const url = await storage.upload(file);
    await updatePhotoURL(url);
  };

  const remove = async () => {
    await storage.remove();
    await updatePhotoURL(null);
  };

  return {
    customPhotoURL,
    providerPhotoURL,
    isWorking: storage.isWorking,
    error: storage.error,
    save,
    remove,
  };
}
