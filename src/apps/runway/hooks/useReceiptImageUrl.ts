import { useEffect, useState } from 'react';
import { getBytes, ref } from 'firebase/storage';

import { storage } from '@lib/firebase/config';

import { useAuth } from '@/hooks/useAuth';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { openBytes } from '@apps/runway/security';
import { getReceiptObjectPath } from '@apps/runway/store/actions/receiptActions';
import type { OpenReceiptImage } from '@apps/runway/types';

const MAX_REMEMBERED_IMAGES = 24;
const remembered = new Map<string, Promise<Blob>>();

type OpeningImage = Pick<
  OpenReceiptImage,
  'id' | 'purchaseId' | 'nonce' | 'contentType'
>;

const openImage = (uid: string, image: OpeningImage) => {
  const known = remembered.get(image.id);
  if (known) return known;
  if (remembered.size >= MAX_REMEMBERED_IMAGES) remembered.clear();
  const opening = (async () => {
    const encryption = await getRunwayEncryption(uid);
    const sealed = await getBytes(
      ref(storage, getReceiptObjectPath(uid, image.purchaseId, image.id)),
    );
    const bytes = await openBytes(
      new Uint8Array(sealed),
      image.nonce,
      encryption,
    );
    return new Blob([bytes as BlobPart], { type: image.contentType });
  })();
  remembered.set(image.id, opening);
  opening.catch(() => remembered.delete(image.id));
  return opening;
};

interface ReceiptImageUrlState {
  id: string;
  url: string | null;
}

/** An object URL for one receipt's opened picture, or `null` while it opens, when it cannot be opened, and while `isEnabled` is false (amounts hidden: nothing is fetched or opened). */
export function useReceiptImageUrl(
  image: OpenReceiptImage,
  isEnabled: boolean,
): { url: string | null; isFailed: boolean } {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<ReceiptImageUrlState | null>(null);
  const { id, purchaseId, nonce, contentType } = image;

  useEffect(() => {
    if (!uid || !isEnabled) return;
    const run = { isCurrent: true, url: null as string | null };
    openImage(uid, { id, purchaseId, nonce, contentType })
      .then((blob) => {
        if (!run.isCurrent) return;
        run.url = URL.createObjectURL(blob);
        setState({ id, url: run.url });
      })
      .catch((error) => {
        console.error('A receipt did not open', error);
        if (run.isCurrent) setState({ id, url: null });
      });
    return () => {
      run.isCurrent = false;
      if (run.url) URL.revokeObjectURL(run.url);
    };
  }, [uid, isEnabled, id, purchaseId, nonce, contentType]);

  const isCurrent = isEnabled && state?.id === id;
  return {
    url: isCurrent ? (state?.url ?? null) : null,
    isFailed: isCurrent && state?.url === null,
  };
}
