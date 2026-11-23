import { useAuth } from '@/hooks/useAuth';
import { useSealedObjectUrl } from '@/hooks/useSealedObjectUrl';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openBytes } from '@apps/helm/security';
import type { SyncedRecord } from '@apps/helm/types';
import { getSyncedPicturePath } from '@apps/helm/utils/syncedPictures';

export function useSyncedPictureUrl(record: SyncedRecord | null) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const picture = record?.picture ?? null;

  return useSealedObjectUrl({
    id: record ? `synced.${record.id}.${picture?.hash ?? ''}` : '',
    path: uid && record ? getSyncedPicturePath(uid, record.id) : '',
    nonce: picture?.nonce ?? '',
    contentType: picture?.contentType ?? 'image/webp',
    open: async (bytes, nonce) => {
      const encryption = await getHelmEncryption(uid ?? '');
      if (picture && encryption.keyId !== picture.keyId) {
        throw new Error('A picture was sealed with another key.');
      }
      return openBytes(bytes, nonce, encryption);
    },
    isEnabled: uid !== null && picture !== null,
  });
}
