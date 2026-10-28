import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader, type SealedReader } from '@apps/runway/security';
import type {
  OpenPurchase,
  PurchaseDoc,
  PurchaseSealed,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

async function openPurchase(
  entry: PurchaseDoc,
  read: SealedReader,
): Promise<OpenPurchase> {
  const payload = await read<PurchaseSealed>(entry.sealed);
  const result: OpenPurchase = {
    id: entry.id,
    date: entry.date,
    source: entry.source,
    needsHome: entry.needsHome,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    amountCents: payload.amountCents,
    merchant: payload.merchant ?? null,
    note: payload.note ?? null,
    lines: payload.lines ?? [],
    refundOfId: payload.refundOfId ?? null,
  };
  return result;
}

/** The purchases dated from `from` on; older ones arrive with the history view. A slow open never overwrites a newer snapshot. */
export function startPurchasesListener(
  uid: string,
  encryption: RunwayEncryption,
  from: number,
  onChange: (purchases: OpenPurchase[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption);

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'runway', 'plans', uid, 'purchases'),
      where('date', '>=', from),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map((entry) =>
            openPurchase(
              { ...(entry.data() as PurchaseDoc), id: entry.id },
              read,
            ),
          ),
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
