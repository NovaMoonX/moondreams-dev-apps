import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import type { DoneForYouEntry } from '@/components/DoneForYouSheet';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { store, useAppSelector } from '@/store';
import {
  AUTO_PAY_WORDS,
  DEPOSIT_WORDS,
  DONE_FOR_YOU_DAYS,
  DONE_FOR_YOU_WORDS,
  NEEDS_HOME_WORDS,
  PAIR_WORDS,
  RULE_WORDS,
} from '@apps/runway/constants';
import { DAY_MS } from '@apps/runway/engine/dates';
import { inTurn } from '@apps/runway/hooks/paidQueue';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { undoChargeMatch } from '@apps/runway/store/actions/autoPayActions';
import {
  markDoneForYouUndone,
  recordDoneForYou,
  type DoneForYouInput,
} from '@apps/runway/store/actions/doneForYouActions';
import {
  returnPurchaseToWaiting,
  splitBankPurchase,
  unlinkDeposit,
  unpairAccountPurchases,
} from '@apps/runway/store/actions/purchaseActions';
import { selectItemLooks } from '@apps/runway/store/selectors/runwaySelectors';
import type {
  DoneForYouUndo,
  OpenDoneForYou,
  OpenPurchase,
} from '@apps/runway/types';
import {
  describeAccountPair,
  describeDepositLinked,
  describePurchaseMatch,
  describePurchaseReturned,
} from '@apps/runway/utils/purchaseText';

export type { DoneForYouInput };

const unrecorded: { uid: string; entries: DoneForYouInput[] }[] = [];

/** Records what a pass did on its own without holding the pass up. One that fails (the vault or a seal, not the network, which Firestore queues) waits here and goes with the next record or reconnect, so a moved purchase never loses its entry for the session. */
export function recordDone(
  uid: string,
  entries: readonly DoneForYouInput[],
): void {
  const waiting = unrecorded.splice(0).filter((batch) => batch.uid === uid);
  const all = [...waiting.flatMap((batch) => batch.entries), ...entries];
  if (all.length === 0) return;
  void getRunwayEncryption(uid)
    .then((encryption) => recordDoneForYou(uid, encryption, all))
    .catch((error: unknown) => {
      unrecorded.push({ uid, entries: all });
      console.error('What was done for you was not recorded', error);
    });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const [first] = unrecorded;
    if (first) recordDone(first.uid, []);
  });
}

/** The purchases an entry's Undo would write, with the `updatedAt` each should still have. */
const getExpected = (undo: DoneForYouUndo): [string, number][] => {
  switch (undo.kind) {
    case 'merge':
      return [[undo.merged.bank.id, undo.merged.updatedAt]];
    case 'deposit':
      return [[undo.linked.id, undo.linked.updatedAt]];
    case 'pair':
      return [
        [undo.paired.out.id, undo.paired.out.updatedAt],
        [undo.paired.into.id, undo.paired.into.updatedAt],
      ];
    case 'rule':
      return [[undo.placed.id, undo.placed.updatedAt]];
    case 'charge':
      return [[undo.result.purchase.id, undo.result.updatedAt]];
  }
};

/** An Undo is offered while every purchase it would write is as the pass left it; one that is not loaded cannot be judged, so the tap checks it. */
const isStillUndoable = (
  undo: DoneForYouUndo,
  purchases: readonly OpenPurchase[],
  waiting: readonly OpenPurchase[],
) =>
  getExpected(undo).every(([id, updatedAt]) => {
    const current = [...purchases, ...waiting].find((entry) => entry.id === id);
    return current === undefined || current.updatedAt === updatedAt;
  });

const getUndoneWords = (undo: DoneForYouUndo) => {
  switch (undo.kind) {
    case 'merge':
      return NEEDS_HOME_WORDS.matchUndone;
    case 'deposit':
      return DEPOSIT_WORDS.undone;
    case 'pair':
      return PAIR_WORDS.undone;
    case 'rule':
      return RULE_WORDS.undone;
    case 'charge':
      return AUTO_PAY_WORDS.undone;
  }
};

async function runUndo(uid: string, undo: DoneForYouUndo) {
  const encryption = await getRunwayEncryption(uid);
  const looks = selectItemLooks(store.getState());
  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
  switch (undo.kind) {
    case 'merge':
      await splitBankPurchase(
        uid,
        encryption,
        undo.merged,
        describePurchaseMatch(
          undo.merged.bank,
          undo.merged.typed,
          nameOf,
          true,
        ),
      );
      return;
    case 'deposit':
      await unlinkDeposit(
        uid,
        encryption,
        undo.linked,
        describeDepositLinked(undo.deposit, undo.dayOn, true),
      );
      return;
    case 'pair':
      await unpairAccountPurchases(
        uid,
        encryption,
        undo.paired.out,
        undo.paired.into,
        describeAccountPair(
          undo.out,
          undo.into,
          undo.pairKind,
          undo.names,
          true,
        ),
      );
      return;
    case 'rule':
      await returnPurchaseToWaiting(
        uid,
        encryption,
        undo.placed,
        describePurchaseReturned(undo.placed, nameOf),
        { ruleId: null, assignedBy: 'person' },
      );
      return;
    case 'charge':
      await inTurn(() => undoChargeMatch(uid, encryption, undo.result));
      return;
  }
}

/** The sentence an action's own refusal carries; a Firestore error (it has a `code`) is never shown. */
const getRefusal = (error: unknown) =>
  error instanceof Error && !('code' in error) && error.message !== ''
    ? error.message
    : DONE_FOR_YOU_WORDS.undoFailed;

/** What Runway did on its own, as the sheet draws it, with the Undo that runs the same action each toast used to offer. */
export function useDoneForYou() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const entries = useAppSelector((state) => state.runway.doneForYou);
  const purchases = useAppSelector((state) => state.runway.purchases);
  const waiting = useAppSelector((state) => state.runway.needsHome);
  const seenAt = useAppSelector(
    (state) => state.runway.plan?.doneForYouSeenAt ?? null,
  );
  const isReady = useAppSelector((state) => state.runway.isDoneForYouLoaded);

  const now = useNow(60 * 60 * 1000);
  const cutoff = now - DONE_FOR_YOU_DAYS * DAY_MS;
  const live = entries.filter((entry) => entry.createdAt >= cutoff);
  const items = live.map((entry: OpenDoneForYou): DoneForYouEntry => ({
    id: entry.id,
    createdAt: entry.createdAt,
    title: entry.title,
    detail: entry.detail,
    whyLine: entry.why,
    canUndo:
      entry.undo !== null && isStillUndoable(entry.undo, purchases, waiting),
    isUndone: entry.undoneAt !== null,
    note:
      entry.undo !== null && !isStillUndoable(entry.undo, purchases, waiting)
        ? DONE_FOR_YOU_WORDS.cannotUndo
        : null,
  }));
  const hasUnseen = live.some(
    (entry) => seenAt === null || entry.createdAt > seenAt,
  );

  const undo = async (id: string): Promise<string | null> => {
    const uid = user?.uid;
    const entry = store.getState().runway.doneForYou.find((e) => e.id === id);
    if (!uid || !entry || entry.undo === null || entry.undoneAt !== null) {
      return DONE_FOR_YOU_WORDS.cannotUndo;
    }
    const { purchases: current, needsHome } = store.getState().runway;
    if (!isStillUndoable(entry.undo, current, needsHome)) {
      return DONE_FOR_YOU_WORDS.cannotUndo;
    }
    try {
      await runUndo(uid, entry.undo);
    } catch (error) {
      return getRefusal(error);
    }
    await markDoneForYouUndone(uid, id).catch((error: unknown) =>
      console.error('An undone entry was not marked', error),
    );
    addToast({
      title: DONE_FOR_YOU_WORDS.undone,
      description: getUndoneWords(entry.undo),
      type: 'success',
    });
    return null;
  };

  return { items, hasUnseen, isReady, undo };
}
