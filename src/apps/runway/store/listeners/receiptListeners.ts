import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader } from '@apps/runway/security';
import type {
  OpenReceiptImage,
  ReceiptImageDoc,
  ReceiptImageSealed,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The receipts did not open.');

/** The receipt photos of one purchase. A slow open never overwrites a newer snapshot. */
export function startReceiptImagesListener(
  uid: string,
  encryption: RunwayEncryption,
  purchaseId: string,
  onChange: (images: OpenReceiptImage[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption);

  const stop = onSnapshot(
    collection(
      db,
      'apps',
      'runway',
      'plans',
      uid,
      'purchases',
      purchaseId,
      'receiptImages',
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map(async (entry) => {
            const data = entry.data() as ReceiptImageDoc;
            const payload = await read<ReceiptImageSealed>(data.sealed);
            return {
              ...payload,
              id: entry.id,
              purchaseId: data.purchaseId,
              createdAt: data.createdAt,
              bytes: data.bytes,
            } satisfies OpenReceiptImage;
          }),
        );
        if (current !== sequence.latest || run.isStopped) return;
        onChange(opened);
      } catch (error) {
        if (current === sequence.latest) onError(toError(error));
      }
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
