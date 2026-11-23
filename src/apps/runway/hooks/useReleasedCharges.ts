import { useEffect, useRef } from 'react';

import { useAppSelector } from '@/store';
import { RELEASED_WORDS } from '@apps/runway/constants';
import { recordDone } from '@apps/runway/hooks/useDoneForYou';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { clearReleasedCharge } from '@apps/runway/store/actions/purchaseActions';
import { removeReceiptImagesOf } from '@apps/runway/store/actions/receiptActions';
import { startReleasedChargesListener } from '@apps/runway/store/listeners/linkListeners';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectIsPlanItemsLoaded,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenReleasedCharge, RunwayEncryption } from '@apps/runway/types';
import {
  describeEnvelopes,
  describeReleasedCharge,
} from '@apps/runway/utils/purchaseText';

/**
 * Tells the person when the bank dropped a pending charge they had placed: the sync already removed it, so this only
 * says where its money went back, writes the History line and clears the note. Each note is handled once across devices.
 */
export function useReleasedCharges(uid: string | null) {
  const level = useAppSelector(selectLevel);
  const looks = useAppSelector(selectItemLooks);
  const isReady = useAppSelector(selectIsPlanItemsLoaded);
  const tried = useRef(new Set<string>());
  const latest = useRef({ looks });

  useEffect(() => {
    latest.current = { looks };
  });

  useEffect(() => {
    if (uid === null || !isReady || level !== 'link') return undefined;
    const handle = async (
      encryption: RunwayEncryption,
      charges: OpenReleasedCharge[],
    ) => {
      const fresh = charges.filter((charge) => !tried.current.has(charge.id));
      if (fresh.length === 0) return;
      fresh.forEach((charge) => tried.current.add(charge.id));
      const nameOf = (envelopeId: string) =>
        latest.current.looks.get(envelopeId)?.name ?? 'its envelope';
      const cleared = await fresh.reduce(
        async (previous, charge) => {
          const done = await previous;
          try {
            // Before the note goes, so a failure leaves it to be tried again rather than orphaning the photos.
            await removeReceiptImagesOf(uid, charge.id);
            const isMine = await clearReleasedCharge(
              uid,
              encryption,
              charge,
              describeReleasedCharge(charge, nameOf),
            );
            return isMine ? [...done, charge] : done;
          } catch (error) {
            tried.current.delete(charge.id);
            console.error('A dropped pending charge was not cleared', error);
            return done;
          }
        },
        Promise.resolve([] as OpenReleasedCharge[]),
      );
      if (cleared.length === 0) return;
      recordDone(
        uid,
        cleared.map((charge) => {
          const isRefund = charge.amountCents < 0;
          return {
            kind: 'released' as const,
            title: RELEASED_WORDS.one(charge.title, isRefund),
            detail: RELEASED_WORDS.oneSub(
              describeEnvelopes(charge.lines, nameOf) || 'Free to Spend',
              isRefund,
            ),
            why: null,
            undo: null,
          };
        }),
      );
    };
    const run = { stop: null as (() => void) | null, isStopped: false };
    void getRunwayEncryption(uid)
      .then((encryption) => {
        if (run.isStopped) return;
        run.stop = startReleasedChargesListener(
          uid,
          encryption,
          (charges) => void handle(encryption, charges),
          (error) =>
            console.error('Dropped pending charges were not read', error),
        );
      })
      .catch((error: unknown) =>
        console.error('Dropped pending charges were not read', error),
      );
    return () => {
      run.isStopped = true;
      run.stop?.();
    };
  }, [uid, isReady, level]);
}
