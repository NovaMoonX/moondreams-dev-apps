import { useEffect, useRef } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { db } from '@lib/firebase/config';
import { useAppSelector } from '@/store';
import { RELEASED_WORDS } from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { createSealedReader } from '@apps/runway/security';
import { clearReleasedCharge } from '@apps/runway/store/actions/purchaseActions';
import { removeReceiptImagesOf } from '@apps/runway/store/actions/receiptActions';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectIsPlanItemsLoaded,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  OpenReleasedCharge,
  ReleasedChargeDoc,
  ReleasedChargeSealed,
} from '@apps/runway/types';
import {
  describeEnvelopes,
  describeReleasedCharge,
} from '@apps/runway/utils/purchaseText';

/**
 * Tells the person when the bank dropped a pending charge they had placed: the sync already removed it, so this only
 * says where its money went back, writes the History line and clears the note. Each note is handled once across devices.
 */
export function useReleasedCharges(uid: string | null) {
  const { addToast } = useToast();
  const level = useAppSelector(selectLevel);
  const looks = useAppSelector(selectItemLooks);
  const isReady = useAppSelector(selectIsPlanItemsLoaded);
  const tried = useRef(new Set<string>());
  const latest = useRef({ addToast, looks });

  useEffect(() => {
    latest.current = { addToast, looks };
  });

  useEffect(() => {
    if (uid === null || !isReady || level !== 'link') return undefined;
    const handle = async (docs: ReleasedChargeDoc[]) => {
      const fresh = docs.filter((entry) => !tried.current.has(entry.id));
      if (fresh.length === 0) return;
      fresh.forEach((entry) => tried.current.add(entry.id));
      const encryption = await getRunwayEncryption(uid);
      const read = createSealedReader(encryption);
      const nameOf = (envelopeId: string) =>
        latest.current.looks.get(envelopeId)?.name ?? 'An envelope';
      const cleared = await fresh.reduce(
        async (previous, entry) => {
          const done = await previous;
          try {
            const sealed = await read<ReleasedChargeSealed>(entry.sealed);
            const charge: OpenReleasedCharge = {
              id: entry.id,
              date: entry.date,
              title: sealed.title ?? null,
              amountCents: sealed.amountCents,
              lines: sealed.lines ?? [],
            };
            const isMine = await clearReleasedCharge(
              uid,
              encryption,
              charge,
              describeReleasedCharge(charge, nameOf),
            );
            if (!isMine) return done;
            await removeReceiptImagesOf(uid, charge.id).catch((error) => {
              console.error('A dropped charge left receipts behind', error);
            });
            return [...done, charge];
          } catch (error) {
            tried.current.delete(entry.id);
            console.error('A dropped pending charge was not cleared', error);
            return done;
          }
        },
        Promise.resolve([] as OpenReleasedCharge[]),
      );
      if (cleared.length === 0) return;
      const [first] = cleared;
      const isRefund = first.amountCents < 0;
      latest.current.addToast(
        cleared.length === 1
          ? {
              title: RELEASED_WORDS.one(first.title, isRefund),
              description: RELEASED_WORDS.oneSub(
                describeEnvelopes(first.lines, nameOf) || 'Free to Spend',
                isRefund,
              ),
              type: 'info',
            }
          : {
              title: RELEASED_WORDS.many(cleared.length),
              description: RELEASED_WORDS.manySub,
              type: 'info',
            },
      );
    };
    return onSnapshot(
      collection(db, 'apps', 'runway', 'plans', uid, 'releasedCharges'),
      (snapshot) => {
        void handle(
          snapshot.docs.map(
            (entry) => ({ ...entry.data(), id: entry.id }) as ReleasedChargeDoc,
          ),
        );
      },
      (error) => console.error('Dropped pending charges were not read', error),
    );
  }, [uid, isReady, level]);
}
