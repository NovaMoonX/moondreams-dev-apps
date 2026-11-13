import { useAuth } from '@/hooks/useAuth';
import {
  forgetSealedObject,
  useSealedObjectUrl,
} from '@/hooks/useSealedObjectUrl';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { openBytes } from '@apps/runway/security';
import { getReceiptObjectPath } from '@apps/runway/store/actions/receiptActions';
import type { OpenReceiptImage } from '@apps/runway/types';

/** Drops a removed receipt's opened picture from this device's memory. */
export const forgetReceiptImage = forgetSealedObject;

/** An object URL for one receipt's opened picture, or `null` while it opens, when it cannot be opened, and while `isEnabled` is false (amounts hidden: nothing is fetched or opened). */
export function useReceiptImageUrl(
  image: OpenReceiptImage,
  isEnabled: boolean,
): { url: string | null; isFailed: boolean } {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  return useSealedObjectUrl({
    id: image.id,
    path: uid ? getReceiptObjectPath(uid, image.purchaseId, image.id) : '',
    nonce: image.nonce,
    contentType: image.contentType,
    open: async (bytes, nonce) =>
      openBytes(bytes, nonce, await getRunwayEncryption(uid ?? '')),
    isEnabled: isEnabled && uid !== null,
  });
}
