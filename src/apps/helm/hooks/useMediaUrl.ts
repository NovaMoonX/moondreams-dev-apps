import { useAuth } from '@/hooks/useAuth';
import { useSealedObjectUrl } from '@/hooks/useSealedObjectUrl';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openBytes } from '@apps/helm/security';
import type { OpenMedia } from '@apps/helm/types';
import { getMediaObjectPath } from '@apps/helm/utils/mediaPath';

/** An object URL for a photo's opened thumbnail or full picture, or `null` while it opens or when it can't be opened. A photo with no thumbnail shows its full picture. */
export function useMediaUrl(
  media: OpenMedia | null,
  variant: 'thumb' | 'full',
): { url: string | null; isFailed: boolean } {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const isThumb =
    variant === 'thumb' && media?.hasThumb === true && !!media.thumbNonce;

  return useSealedObjectUrl({
    id: media ? `${media.id}${isThumb ? '.thumb' : ''}` : '',
    path: uid && media ? getMediaObjectPath(uid, media.id, isThumb) : '',
    nonce: (isThumb ? media?.thumbNonce : media?.bytesNonce) ?? '',
    contentType: media?.mimeType ?? 'image/webp',
    open: async (bytes, nonce) => {
      const encryption = await getHelmEncryption(uid ?? '');
      if (media && encryption.keyId !== media.keyId) {
        throw new Error('A photo was sealed with another key.');
      }
      return openBytes(bytes, nonce, encryption);
    },
    isEnabled: uid !== null && media !== null && !media.isUnreadable,
  });
}
