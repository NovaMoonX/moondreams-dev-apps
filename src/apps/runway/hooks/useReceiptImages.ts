import { useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { startReceiptImagesListener } from '@apps/runway/store/listeners/receiptListeners';
import type { OpenReceiptImage } from '@apps/runway/types';

interface ReceiptImagesState {
  purchaseId: string;
  images: OpenReceiptImage[] | null;
}

/** The receipt photos of one purchase, oldest first; `null` until they are read, and when they cannot be. */
export function useReceiptImages(
  purchaseId: string,
): OpenReceiptImage[] | null {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<ReceiptImagesState>({
    purchaseId,
    images: null,
  });

  useEffect(() => {
    if (!uid) return;
    const run = { isCurrent: true };
    const stop: { current: (() => void) | null } = { current: null };
    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startReceiptImagesListener(
          uid,
          encryption,
          purchaseId,
          (images) => setState({ purchaseId, images }),
          (error) => console.error('The receipts did not open', error),
        );
      })
      .catch((error) => console.error('The receipts did not open', error));
    return () => {
      run.isCurrent = false;
      stop.current?.();
    };
  }, [uid, purchaseId]);

  return state.purchaseId === purchaseId && state.images
    ? [...state.images].sort((a, b) => a.createdAt - b.createdAt)
    : null;
}
