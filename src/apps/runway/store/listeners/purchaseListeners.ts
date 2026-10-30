import {
  collection,
  onSnapshot,
  query,
  where,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader } from '@apps/runway/security';
import { openPurchase } from '@apps/runway/store/listeners/openLedger';
import type {
  OpenPurchase,
  PurchaseDoc,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

/** The purchases dated from `from` on (and before `to` when it is given); older ones are read by period. A slow open never overwrites a newer snapshot. */
export function startPurchasesListener(
  uid: string,
  encryption: RunwayEncryption,
  from: number,
  onChange: (purchases: OpenPurchase[]) => void,
  onError: (error: Error) => void,
  to: number | null = null,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption);

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'runway', 'plans', uid, 'purchases'),
      where('date', '>=', from),
      ...(to === null ? [] : [where('date', '<', to)]),
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

function startConstrainedPurchasesListener(
  uid: string,
  encryption: RunwayEncryption,
  constraint: QueryConstraint,
  onChange: (purchases: OpenPurchase[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption);

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'runway', 'plans', uid, 'purchases'),
      constraint,
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

/** Every purchase in one expense group, whatever its date. A slow open never overwrites a newer snapshot. */
export const startExpensePurchasesListener = (
  uid: string,
  encryption: RunwayEncryption,
  expenseId: string,
  onChange: (purchases: OpenPurchase[]) => void,
  onError: (error: Error) => void,
): Unsubscribe =>
  startConstrainedPurchasesListener(
    uid,
    encryption,
    where('expenseId', '==', expenseId),
    onChange,
    onError,
  );

/** Every purchase that belongs to any expense group, whatever its date. */
export const startGroupedPurchasesListener = (
  uid: string,
  encryption: RunwayEncryption,
  onChange: (purchases: OpenPurchase[]) => void,
  onError: (error: Error) => void,
): Unsubscribe =>
  startConstrainedPurchasesListener(
    uid,
    encryption,
    where('expenseId', '!=', null),
    onChange,
    onError,
  );
