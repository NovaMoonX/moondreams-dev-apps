import { useEffect, useRef, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import {
  DEPOSIT_WORDS,
  NEEDS_HOME_WORDS,
  PAIR_WORDS,
} from '@apps/runway/constants';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  findAccountPairs,
  findDepositDays,
  findPurchaseMatches,
} from '@apps/runway/engine/matching';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { setLinesDone } from '@apps/runway/store/actions/moveActions';
import {
  linkDepositToDay,
  mergeBankPurchase,
  pairAccountPurchases,
  recordPairTick,
  splitBankPurchase,
  unlinkDeposit,
  unpairAccountPurchases,
  type MergedPurchase,
  type PairedPurchases,
} from '@apps/runway/store/actions/purchaseActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectMoveTick } from '@apps/runway/store/selectors/moveSelectors';
import {
  selectAllCards,
  selectDepositDays,
  selectIsAccountsLoaded,
  selectIsDaysLoaded,
  selectIsMovesLoaded,
  selectIsNeedsHomeLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  CardPaymentCovers,
  OpenPurchase,
  RunwayEncryption,
  PurchaseAssignedBy,
  PurchasePairKind,
} from '@apps/runway/types';
import { getCardNamer } from '@apps/runway/utils/cardText';
import {
  describeAccountPair,
  describeDepositLinked,
  describePayDay,
  describePurchaseMatch,
  getPairSideName,
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
      description:
        merged.length === 1
          ? NEEDS_HOME_WORDS.matchedOneSub
          : NEEDS_HOME_WORDS.matchedManySub,
      type: 'success',
      action: {
        label: NEEDS_HOME_WORDS.undo,
        onClick: () => void undo(uid, merged),
      },
    });
    return merged.length;
  };
}

/** Older charges are left to the offer on their own sheet, so a first link never merges weeks of purchases at once. */
const AUTO_MATCH_DAYS = 14;

/** Once both lists are read, merges each recent bank charge waiting in Needs a home with the one purchase typed by hand that it clearly is. Each pair is tried once per version of the two, so a refusal is not retried in a loop. */
export function useMatchBankPurchases(uid: string | null) {
  const waiting = useAppSelector((state) => state.runway.needsHome);
  const isWaitingLoaded = useAppSelector(selectIsNeedsHomeLoaded);
  const purchases = useAppSelector((state) => state.runway.purchases);
  const isPurchasesLoaded = useAppSelector(
    (state) => state.runway.purchasesFrom !== null,
  );
  const merge = useMergeWithUndo();
  const mergeRef = useRef(merge);
  const tried = useRef(new Set<string>());
  const isRunning = useRef(false);
  const isWaitingToRun = useRef(false);
  const [runs, setRuns] = useState(0);

  useEffect(() => {
    mergeRef.current = merge;
  });

  useEffect(() => {
    if (uid === null || !isWaitingLoaded || !isPurchasesLoaded) return;
    if (isRunning.current) {
      isWaitingToRun.current = true;
      return;
    }
    const since = todayAsUtcDate() - AUTO_MATCH_DAYS * DAY_MS;
    const byId = new Map(
      [...waiting, ...purchases].map((purchase) => [purchase.id, purchase]),
    );
    const pairs = [...findPurchaseMatches(waiting, purchases).clear].flatMap(
      ([bankId, typedId]) => {
        const bank = byId.get(bankId);
        const typed = byId.get(typedId);
        if (!bank || !typed || bank.date < since) return [];
        const key = `${bank.id}:${bank.updatedAt}:${typed.id}:${typed.updatedAt}`;
        return tried.current.has(key) ? [] : [{ bank, typed, key }];
      },
    );
    if (pairs.length === 0) return;
    pairs.forEach(({ key }) => tried.current.add(key));
    isRunning.current = true;
    const run = async () => {
      try {
        await mergeRef.current(uid, pairs);
      } catch (error) {
        // The vault or the network failed before any pair was tried, so they may be tried again.
        pairs.forEach(({ key }) => tried.current.delete(key));
        console.error('Bank purchases were not matched', error);
      } finally {
        isRunning.current = false;
        if (isWaitingToRun.current) {
          isWaitingToRun.current = false;
          setRuns((count) => count + 1);
        }
      }
    };
    void run();
  }, [uid, waiting, purchases, isWaitingLoaded, isPurchasesLoaded, runs]);
}

interface DepositPair {
  deposit: OpenPurchase;
  dayKey: string;
  dayOn: number;
}

/** Links deposits to their income days, one after another, and says so in one toast with an Undo that sends them all back to Needs a home. Resolves with how many linked; a deposit another device changed first is skipped, or throws when `shouldThrow`. */
export function useLinkDepositsWithUndo() {
  const { addToast } = useToast();

  const undo = async (
    uid: string,
    linked: readonly (DepositPair & { linked: OpenPurchase })[],
  ) => {
    try {
      const encryption = await getRunwayEncryption(uid);
      await linked.reduce(async (previous, entry) => {
        await previous;
        await unlinkDeposit(
          uid,
          encryption,
          entry.linked,
          describeDepositLinked(entry.deposit, entry.dayOn, true),
        );
      }, Promise.resolve());
      addToast({ title: DEPOSIT_WORDS.undone, type: 'success' });
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
    pairs: readonly DepositPair[],
    assignedBy: 'auto' | 'person',
    shouldThrow = false,
  ): Promise<number> => {
    const encryption = await getRunwayEncryption(uid);
    const done = await pairs.reduce(
      async (previous, pair) => {
        const list = await previous;
        try {
          const updatedAt = await linkDepositToDay(
            uid,
            encryption,
            pair.deposit,
            pair.dayKey,
            assignedBy,
            describeDepositLinked(pair.deposit, pair.dayOn, false),
          );
          return [
            ...list,
            {
              ...pair,
              linked: {
                ...pair.deposit,
                lines: [],
                needsHome: false,
                incomeDayId: pair.dayKey,
                assignedBy,
                updatedAt,
              },
            },
          ];
        } catch (error) {
          if (shouldThrow) throw error;
          console.error('A deposit was not linked', error);
          return list;
        }
      },
      Promise.resolve([] as (DepositPair & { linked: OpenPurchase })[]),
    );
    if (done.length === 0) return 0;
    addToast({
      title:
        done.length === 1
          ? DEPOSIT_WORDS.linkedOne(
              formatCents(-done[0].deposit.amountCents),
              describePayDay(done[0].dayOn),
            )
          : DEPOSIT_WORDS.linkedMany(done.length),
      description:
        done.length === 1
          ? DEPOSIT_WORDS.linkedSub
          : DEPOSIT_WORDS.linkedManySub,
      type: 'success',
      action: {
        label: NEEDS_HOME_WORDS.undo,
        onClick: () => void undo(uid, done),
      },
    });
    return done.length;
  };
}

/** Once the days and Needs a home are read, links each recent posted deposit to the income day it clearly is. Each pair is tried once per version of the deposit, so a refusal is not retried in a loop. */
export function useMatchDeposits(uid: string | null) {
  const waiting = useAppSelector((state) => state.runway.needsHome);
  const purchases = useAppSelector((state) => state.runway.purchases);
  const days = useAppSelector((state) =>
    selectDepositDays(state, todayAsUtcDate()),
  );
  const isReady = useAppSelector(
    (state) =>
      selectIsNeedsHomeLoaded(state) &&
      state.runway.purchasesFrom !== null &&
      selectIsPlanItemsLoaded(state) &&
      selectIsDaysLoaded(state) &&
      selectIsRecordsReady(state),
  );
  const link = useLinkDepositsWithUndo();
  const linkRef = useRef(link);
  const tried = useRef(new Set<string>());
  const isRunning = useRef(false);
  const isWaitingToRun = useRef(false);
  const [runs, setRuns] = useState(0);

  useEffect(() => {
    linkRef.current = link;
  });

  useEffect(() => {
    if (uid === null || !isReady) return;
    if (isRunning.current) {
      isWaitingToRun.current = true;
      return;
    }
    const since = todayAsUtcDate() - AUTO_MATCH_DAYS * DAY_MS;
    const byId = new Map(waiting.map((purchase) => [purchase.id, purchase]));
    const pairs = [...findDepositDays(waiting, days, purchases).clear].flatMap(
      ([depositId, dayKey]) => {
        const deposit = byId.get(depositId);
        const day = days.find((entry) => entry.dayKey === dayKey);
        if (!deposit || !day || deposit.date < since) return [];
        const key = `${deposit.id}:${deposit.updatedAt}:${dayKey}`;
        return tried.current.has(key)
          ? []
          : [{ deposit, dayKey, dayOn: day.expectedOn, key }];
      },
    );
    if (pairs.length === 0) return;
    pairs.forEach(({ key }) => tried.current.add(key));
    isRunning.current = true;
    const run = async () => {
      try {
        await linkRef.current(uid, pairs, 'auto');
      } catch (error) {
        // The vault or the network failed before any pair was tried, so they may be tried again.
        pairs.forEach(({ key }) => tried.current.delete(key));
        console.error('Deposits were not linked', error);
      } finally {
        isRunning.current = false;
        if (isWaitingToRun.current) {
          isWaitingToRun.current = false;
          setRuns((count) => count + 1);
        }
      }
    };
    void run();
  }, [uid, waiting, purchases, days, isReady, runs]);
}

export interface AccountPairInput {
  out: OpenPurchase;
  into: OpenPurchase;
  kind: PurchasePairKind;
}

interface DonePair extends AccountPairInput {
  paired: PairedPurchases;
  names: { from: string; to: string };
}

/** A payment covers the card in full when it is at least what the card owes now. */
const getCovers = (pair: AccountPairInput): CardPaymentCovers =>
  pair.out.amountCents >=
  Math.max(
    0,
    selectBalances(store.getState()).reserveByCard[
      pair.into.paidByCardId ?? ''
    ] ?? 0,
  )
    ? 'full'
    : 'part';

/** Ticks the income day's "Move to" item that a transfer into a pull account is, unless it was ticked already, and records the tick on the money in so every way out of the pair unticks it; resolves with the money in as it now stands. A tick that does not save never fails the pairing. */
async function tickMove(
  uid: string,
  encryption: RunwayEncryption,
  into: OpenPurchase,
  /** The day a lost pair's own tick was on, which its pairing just took back though the store may still show it. */
  untickedDayKey: string | null,
): Promise<OpenPurchase> {
  const state = store.getState();
  const account = state.runway.accounts.find(
    (entry) => entry.id === into.accountId,
  );
  if (!account?.isPullAccount) return into;
  const tick = selectMoveTick(state, todayAsUtcDate(), account.id, into.date);
  if (tick === null || (tick.isDone && tick.dayKey !== untickedDayKey)) {
    return into;
  }
  try {
    await setLinesDone(uid, tick.dayKey, [tick.lineId], true, tick.doneIds);
  } catch (error) {
    console.error('A move to an account was not ticked', error);
    return into;
  }
  try {
    return await recordPairTick(uid, encryption, into, tick.dayKey);
  } catch (error) {
    console.error('A move to an account was ticked but not recorded', error);
    await setLinesDone(uid, tick.dayKey, [tick.lineId], false, []).catch(
      () => undefined,
    );
    return into;
  }
}

/** Pairs money out with the money in it is the other side of, one after another, and says so in one toast with an Undo that sends them all back to Needs a home. Resolves with how many paired; a pair another device changed first is skipped, or throws when `shouldThrow`. */
export function usePairAccountsWithUndo() {
  const { addToast } = useToast();
  const mask = useMaskedText();
  const accounts = useAppSelector((state) => state.runway.accounts);
  const cards = useAppSelector(selectAllCards);
  const cardNameOf = getCardNamer(cards);

  const undo = async (uid: string, done: readonly DonePair[]) => {
    try {
      const encryption = await getRunwayEncryption(uid);
      await done.reduce(async (previous, entry) => {
        await previous;
        await unpairAccountPurchases(
          uid,
          encryption,
          entry.paired.out,
          entry.paired.into,
          describeAccountPair(
            entry.out,
            entry.into,
            entry.kind,
            entry.names,
            true,
          ),
        );
      }, Promise.resolve());
      addToast({ title: PAIR_WORDS.undone, type: 'success' });
    } catch (undoError) {
      addToast({
        title: NEEDS_HOME_WORDS.undoFailed,
        description: getErrorMessage(undoError, ''),
        type: 'error',
      });
    }
  };

  const getTitle = (entry: DonePair) => {
    const amount = formatCents(entry.out.amountCents);
    return entry.kind === 'cardPayment'
      ? PAIR_WORDS.paidCard(amount, entry.names.to, entry.names.from)
      : PAIR_WORDS.transferred(amount, entry.names.from, entry.names.to);
  };

  return async (
    uid: string,
    pairs: readonly AccountPairInput[],
    assignedBy: PurchaseAssignedBy,
    shouldThrow = false,
  ): Promise<number> => {
    const encryption = await getRunwayEncryption(uid);
    const done = await pairs.reduce(
      async (previous, pair) => {
        const list = await previous;
        const names = {
          from: getPairSideName(pair.out, accounts, cardNameOf),
          to: getPairSideName(pair.into, accounts, cardNameOf),
        };
        try {
          const paired = await pairAccountPurchases(
            uid,
            encryption,
            pair.out,
            pair.into,
            pair.kind,
            assignedBy,
            describeAccountPair(pair.out, pair.into, pair.kind, names, false),
            getCovers(pair),
          );
          const into =
            pair.kind === 'transfer'
              ? await tickMove(
                  uid,
                  encryption,
                  paired.into,
                  pair.into.tickedDayKey,
                )
              : paired.into;
          return [...list, { ...pair, paired: { ...paired, into }, names }];
        } catch (error) {
          if (shouldThrow) throw error;
          console.error('Purchases were not paired', error);
          return list;
        }
      },
      Promise.resolve([] as DonePair[]),
    );
    if (done.length === 0) return 0;
    addToast({
      title: mask(
        done.length === 1
          ? getTitle(done[0])
          : PAIR_WORDS.pairedMany(done.length),
      ),
      description:
        done.length === 1
          ? done[0].kind === 'cardPayment'
            ? PAIR_WORDS.paidCardSub
            : PAIR_WORDS.transferredSub
          : PAIR_WORDS.pairedManySub,
      type: 'success',
      action: {
        label: NEEDS_HOME_WORDS.undo,
        onClick: () => void undo(uid, done),
      },
    });
    return done.length;
  };
}

/** Sends one pair back to Needs a home, with a toast whose Undo pairs it again. Throws when it did not save, for the caller to show. */
export function useUnpairAccounts() {
  const { addToast } = useToast();
  const accounts = useAppSelector((state) => state.runway.accounts);
  const cardNameOf = getCardNamer(useAppSelector(selectAllCards));
  const pairAccounts = usePairAccountsWithUndo();

  return async (uid: string, pair: AccountPairInput) => {
    const names = {
      from: getPairSideName(pair.out, accounts, cardNameOf),
      to: getPairSideName(pair.into, accounts, cardNameOf),
    };
    const back = await unpairAccountPurchases(
      uid,
      await getRunwayEncryption(uid),
      pair.out,
      pair.into,
      describeAccountPair(pair.out, pair.into, pair.kind, names, true),
    );
    addToast({
      title: PAIR_WORDS.unpaired,
      type: 'success',
      action: {
        label: NEEDS_HOME_WORDS.undo,
        onClick: () =>
          void pairAccounts(
            uid,
            [{ out: back.out, into: back.into, kind: pair.kind }],
            'person',
            true,
          ).catch((undoError: unknown) =>
            addToast({
              title: NEEDS_HOME_WORDS.undoFailed,
              description: getErrorMessage(undoError, ''),
              type: 'error',
            }),
          ),
      },
    });
  };
}

/** Once Needs a home, the accounts, the cards and the days are read, pairs each recent posted money out with the one money in it clearly is the other side of. Each pair is tried once per version of the two, so a refusal is not retried in a loop. */
export function useMatchAccountPairs(uid: string | null) {
  const waiting = useAppSelector((state) => state.runway.needsHome);
  const isReady = useAppSelector(
    (state) =>
      selectIsNeedsHomeLoaded(state) &&
      state.runway.purchasesFrom !== null &&
      state.runway.isCardsLoaded &&
      selectIsAccountsLoaded(state) &&
      selectIsMovesLoaded(state) &&
      selectIsPlanItemsLoaded(state) &&
      selectIsDaysLoaded(state) &&
      selectIsRecordsReady(state),
  );
  const pair = usePairAccountsWithUndo();
  const pairRef = useRef(pair);
  const tried = useRef(new Set<string>());
  const isRunning = useRef(false);
  const isWaitingToRun = useRef(false);
  const [runs, setRuns] = useState(0);

  useEffect(() => {
    pairRef.current = pair;
  });

  useEffect(() => {
    if (uid === null || !isReady) return;
    if (isRunning.current) {
      isWaitingToRun.current = true;
      return;
    }
    const since = todayAsUtcDate() - AUTO_MATCH_DAYS * DAY_MS;
    const byId = new Map(waiting.map((purchase) => [purchase.id, purchase]));
    const pairs = [...findAccountPairs(waiting).clear].flatMap(
      ([outId, { inId, kind }]) => {
        const out = byId.get(outId);
        const into = byId.get(inId);
        if (!out || !into || out.date < since || into.date < since) return [];
        const key = `${out.id}:${out.updatedAt}:${into.id}:${into.updatedAt}`;
        return tried.current.has(key) ? [] : [{ out, into, kind, key }];
      },
    );
    if (pairs.length === 0) return;
    pairs.forEach(({ key }) => tried.current.add(key));
    isRunning.current = true;
    const run = async () => {
      try {
        await pairRef.current(uid, pairs, 'auto');
      } catch (error) {
        // The vault or the network failed before any pair was tried, so they may be tried again.
        pairs.forEach(({ key }) => tried.current.delete(key));
        console.error('Purchases were not paired', error);
      } finally {
        isRunning.current = false;
        if (isWaitingToRun.current) {
          isWaitingToRun.current = false;
          setRuns((count) => count + 1);
        }
      }
    };
    void run();
  }, [uid, waiting, isReady, runs]);
}
