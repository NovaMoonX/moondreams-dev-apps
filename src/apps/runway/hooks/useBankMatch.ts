import { useEffect, useRef } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { NEEDS_HOME_WORDS } from '@apps/runway/constants';
import { findPurchaseMatches } from '@apps/runway/engine/matching';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  mergeBankPurchase,
  splitBankPurchase,
  type MergedPurchase,
} from '@apps/runway/store/actions/purchaseActions';
import {
  selectIsNeedsHomeLoaded,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';
import {
  describePurchaseMatch,
  getPurchaseTitle,
} from '@apps/runway/utils/purchaseText';

interface MatchPair {
  bank: OpenPurchase;
  typed: OpenPurchase;
}

/** Merges bank purchases with the ones typed by hand for them, one after another, and says so in one toast with an Undo that splits them all again. Resolves with how many merged; a pair another device changed first is skipped. */
export function useMergeWithUndo() {
  const { addToast } = useToast();
  const looks = useAppSelector(selectItemLooks);
  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';

  const undo = async (uid: string, merged: readonly MergedPurchase[]) => {
    try {
      const encryption = await getRunwayEncryption(uid);
      await merged.reduce(async (previous, entry) => {
        await previous;
        await splitBankPurchase(
          uid,
          encryption,
          entry,
          describePurchaseMatch(entry.bank, entry.typed, nameOf, true),
        );
      }, Promise.resolve());
      addToast({ title: NEEDS_HOME_WORDS.matchUndone, type: 'success' });
    } catch (undoError) {
      addToast({
        title: NEEDS_HOME_WORDS.undoFailed,
        description: getErrorMessage(undoError, ''),
        type: 'error',
      });
    }
  };

  return async (
    uid: string,
    pairs: readonly MatchPair[],
    shouldThrow = false,
  ): Promise<number> => {
    const encryption = await getRunwayEncryption(uid);
    const merged = await pairs.reduce(
      async (done, { bank, typed }) => {
        const list = await done;
        try {
          const entry = await mergeBankPurchase(
            uid,
            encryption,
            bank,
            typed,
            describePurchaseMatch(bank, typed, nameOf, false),
          );
          return [...list, entry];
        } catch (error) {
          if (shouldThrow) throw error;
          console.error('A bank purchase was not matched', error);
          return list;
        }
      },
      Promise.resolve([] as MergedPurchase[]),
    );
    if (merged.length === 0) return 0;
    addToast({
      title:
        merged.length === 1
          ? NEEDS_HOME_WORDS.matchedOne(
              getPurchaseTitle(merged[0].typed, nameOf),
            )
          : NEEDS_HOME_WORDS.matchedMany(merged.length),
      description: NEEDS_HOME_WORDS.matchedSub,
      type: 'success',
      action: {
        label: NEEDS_HOME_WORDS.undo,
        onClick: () => void undo(uid, merged),
      },
    });
    return merged.length;
  };
}

/** Once both lists are read, merges each bank charge waiting in Needs a home with the one purchase typed by hand that it clearly is. Each pair is tried once per version of the two, so a refusal is not retried in a loop. */
export function useMatchBankPurchases(uid: string | null) {
  const waiting = useAppSelector((state) => state.runway.needsHome);
  const isWaitingLoaded = useAppSelector(selectIsNeedsHomeLoaded);
  const purchases = useAppSelector((state) => state.runway.purchases);
  const isPurchasesLoaded = useAppSelector(
    (state) => state.runway.purchasesFrom !== null,
  );
  const merge = useMergeWithUndo();
  const tried = useRef(new Set<string>());
  const isRunning = useRef(false);

  useEffect(() => {
    if (uid === null || !isWaitingLoaded || !isPurchasesLoaded) return;
    if (isRunning.current) return;
    const byId = new Map(
      [...waiting, ...purchases].map((purchase) => [purchase.id, purchase]),
    );
    const pairs = [...findPurchaseMatches(waiting, purchases).clear].flatMap(
      ([bankId, typedId]) => {
        const bank = byId.get(bankId);
        const typed = byId.get(typedId);
        if (!bank || !typed) return [];
        const key = `${bank.id}:${bank.updatedAt}:${typed.id}:${typed.updatedAt}`;
        return tried.current.has(key) ? [] : [{ bank, typed, key }];
      },
    );
    if (pairs.length === 0) return;
    pairs.forEach(({ key }) => tried.current.add(key));
    isRunning.current = true;
    const run = async () => {
      try {
        await merge(uid, pairs);
      } catch (error) {
        console.error('Bank purchases were not matched', error);
      } finally {
        isRunning.current = false;
      }
    };
    void run();
  }, [uid, waiting, purchases, isWaitingLoaded, isPurchasesLoaded, merge]);
}
