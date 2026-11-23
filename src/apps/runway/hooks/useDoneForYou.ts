import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import type { DoneForYouEntry } from '@/components/DoneForYouSheet';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { store, useAppSelector, type RootState } from '@/store';
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
  DateOnly,
  DoneForYouKind,
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

/** The purchases an entry's Undo would write, each with the `updatedAt` it should still have and its day. */
const getExpected = (
  undo: DoneForYouUndo,
): { id: string; updatedAt: number; date: DateOnly }[] => {
  switch (undo.kind) {
    case 'merge':
      return [
        {
          id: undo.merged.bank.id,
          updatedAt: undo.merged.updatedAt,
          date: undo.merged.bank.date,
        },
      ];
    case 'deposit':
      return [
        {
          id: undo.linked.id,
          updatedAt: undo.linked.updatedAt,
          date: undo.linked.date,
        },
      ];
    case 'pair':
      return [undo.paired.out, undo.paired.into].map((side) => ({
        id: side.id,
        updatedAt: side.updatedAt,
        date: side.date,
      }));
    case 'rule':
      return [
        {
          id: undo.placed.id,
          updatedAt: undo.placed.updatedAt,
          date: undo.placed.date,
        },
      ];
    case 'charge':
      return [
        {
          id: undo.result.purchase.id,
          updatedAt: undo.result.updatedAt,
          date: undo.result.purchase.date,
        },
      ];
  }
};

interface KnownPurchases {
  purchases: readonly OpenPurchase[];
  /** Where the loaded window of purchases starts; a missing purchase dated in it was removed. */
  from: DateOnly | null;
}

/** An Undo is offered while every purchase it would write is as the pass left it; one dated before the loaded window cannot be judged, so the tap checks it. */
const isStillUndoable = (undo: DoneForYouUndo, known: KnownPurchases) =>
  getExpected(undo).every(({ id, updatedAt, date }) => {
    const current = known.purchases.find((entry) => entry.id === id);
    if (current) return current.updatedAt === updatedAt;
    return known.from === null || date < known.from;
  });

const getKnown = (state: RootState['runway']): KnownPurchases => ({
  purchases: [
    ...state.purchases,
    ...state.needsHome,
    ...(state.linkHistoryPurchases ?? []),
  ],
  from: state.purchasesFrom,
});

/** The line an entry with no Undo shows, naming its own way back where there is one. */
const getNoUndoNote = (kind: DoneForYouKind) => {
  switch (kind) {
    case 'autoMark':
      return DONE_FOR_YOU_WORDS.autoMarkedNote;
    case 'ended':
      return DONE_FOR_YOU_WORDS.endedNote;
    case 'history':
    case 'released':
      return DONE_FOR_YOU_WORDS.nothingToUndo;
    default:
      return null;
  }
};

/** The Undo button names what it puts back. */
const getUndoLabel = (undo: DoneForYouUndo) => {
  switch (undo.kind) {
    case 'merge':
      return DONE_FOR_YOU_WORDS.undoMerge;
    case 'deposit':
      return DONE_FOR_YOU_WORDS.undoDeposit;
    case 'pair':
      return DONE_FOR_YOU_WORDS.undoPair;
    case 'rule':
      return DONE_FOR_YOU_WORDS.undoRule;
    case 'charge':
      return DONE_FOR_YOU_WORDS.undoCharge;
  }
};

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
  const linkHistory = useAppSelector(
    (state) => state.runway.linkHistoryPurchases,
  );
  const purchasesFrom = useAppSelector((state) => state.runway.purchasesFrom);
  const seenAt = useAppSelector(
    (state) => state.runway.plan?.doneForYouSeenAt ?? null,
  );
  const isReady = useAppSelector((state) => state.runway.isDoneForYouLoaded);
  const known: KnownPurchases = {
    purchases: [...purchases, ...waiting, ...(linkHistory ?? [])],
    from: purchasesFrom,
  };

  const now = useNow(60 * 60 * 1000);
  const cutoff = now - DONE_FOR_YOU_DAYS * DAY_MS;
  const live = entries.filter((entry) => entry.createdAt >= cutoff);
  const items = live.map((entry: OpenDoneForYou): DoneForYouEntry => {
    const canUndo = entry.undo !== null && isStillUndoable(entry.undo, known);
    const getNote = () => {
      if (entry.undo === null) return getNoUndoNote(entry.kind);
      return canUndo ? null : DONE_FOR_YOU_WORDS.cannotUndo;
    };
    return {
      id: entry.id,
      createdAt: entry.createdAt,
      title: entry.title,
      detail: entry.detail,
      whyLine: entry.why,
      canUndo,
      isUndone: entry.undoneAt !== null,
      note: getNote(),
      rowNote:
        entry.undo !== null && !canUndo
          ? DONE_FOR_YOU_WORDS.cannotUndoRow
          : null,
      undoLabel: entry.undo === null ? null : getUndoLabel(entry.undo),
    };
  });
  const hasUnseen = live.some(
    (entry) => seenAt === null || entry.createdAt > seenAt,
  );

  const undo = async (id: string): Promise<string | null> => {
    const uid = user?.uid;
    const entry = store.getState().runway.doneForYou.find((e) => e.id === id);
    if (!uid || !entry || entry.undo === null || entry.undoneAt !== null) {
      return DONE_FOR_YOU_WORDS.cannotUndo;
    }
    if (!isStillUndoable(entry.undo, getKnown(store.getState().runway))) {
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
