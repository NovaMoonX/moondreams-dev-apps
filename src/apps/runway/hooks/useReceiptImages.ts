import { useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { startReceiptImagesListener } from '@apps/runway/store/listeners/receiptListeners';
import type { OpenReceiptImage } from '@apps/runway/types';

export type ReceiptImagesResult =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; images: OpenReceiptImage[] };

type ReceiptImagesState = { purchaseId: string } & (
  { status: 'failed' } | { status: 'loaded'; images: OpenReceiptImage[] }
);

/** The receipt photos of one purchase, oldest first, once read; a failed read is its own state, never an empty list. */
export function useReceiptImages(purchaseId: string): ReceiptImagesResult {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<ReceiptImagesState | null>(null);

  useEffect(() => {
    if (!uid) return;
    const run = { isCurrent: true };
    const stop: { current: (() => void) | null } = { current: null };
    const fail = (error: unknown) => {
      console.error('The receipts did not open', error);
      if (run.isCurrent) setState({ purchaseId, status: 'failed' });
    };
    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startReceiptImagesListener(
          uid,
          encryption,
          purchaseId,
          (images) => setState({ purchaseId, status: 'loaded', images }),
          fail,
        );
      })
      .catch(fail);
    return () => {
      run.isCurrent = false;
      stop.current?.();
    };
  }, [uid, purchaseId]);

  if (state === null || state.purchaseId !== purchaseId) {
    return { status: 'loading' };
  }
  return state.status === 'failed'
    ? { status: 'failed' }
    : {
        status: 'loaded',
        images: [...state.images].sort((a, b) => a.createdAt - b.createdAt),
      };
}
