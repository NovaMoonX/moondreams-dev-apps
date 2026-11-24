import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useState } from 'react';

import {
  ArrowLeftRight,
  ArrowUpRight,
  Receipt,
  Repeat,
  TriangleAlert,
} from 'lucide-react';

import type {
  DoneForYouDoor,
  DoneForYouEntry,
} from '@/components/DoneForYouSheet';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { store, useAppSelector, type RootState } from '@/store';
import { getDoneForYouLook } from '@apps/runway/components/doneForYouLook';
import {
  AUTO_PAY_WORDS,
  COVER_WORDS,
  DEPOSIT_WORDS,
  DONE_FOR_YOU_DAYS,
  DONE_FOR_YOU_WORDS,
  STORE_ORDER_WORDS,
  NEEDS_HOME_WORDS,
  NEEDS_LOOK_WORDS,
  PAIR_WORDS,
  RULE_WORDS,
} from '@apps/runway/constants';
import { DAY_MS } from '@apps/runway/engine/dates';
import { inTurn } from '@apps/runway/hooks/paidQueue';
import {
  undoStoreRefund,
  undoTakeOff,
} from '@apps/runway/store/actions/storeOrderActions';
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
import { selectLedgerOnlyBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { getPlacedOver } from '@apps/runway/store/selectors/spillSelectors';
import {
  selectIsRulesLoaded,
  selectItemLooks,
  selectRules,
  selectSorting,
  isQuietBySorting,
} from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { setOpenRuleRequest } from '@apps/runway/utils/openRuleRequest';
import type {
  DateOnly,
  DoneForYouKind,
  DoneForYouUndo,
  OpenDoneForYou,
  OpenPurchase,
  PlanSection,
  SortingState,
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
    case 'storeRefund':
      return [
        {
          id: undo.applied.id,
          updatedAt: undo.applied.updatedAt,
          date: undo.applied.date,
        },
      ];
    case 'storeCancel':
      return [undo.written, undo.cancel].flatMap((purchase) =>
        purchase === null
          ? []
          : [
              {
                id: purchase.id,
                updatedAt: purchase.updatedAt,
                date: purchase.date,
              },
            ],
      );
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

const toKnown = ({
  purchases,
  needsHome,
  linkHistoryPurchases,
  purchasesFrom,
}: Pick<
  RootState['runway'],
  'purchases' | 'needsHome' | 'linkHistoryPurchases' | 'purchasesFrom'
>): KnownPurchases => ({
  purchases: [...purchases, ...needsHome, ...(linkHistoryPurchases ?? [])],
  from: purchasesFrom,
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
      return DONE_FOR_YOU_WORDS.noUndo;
  }
};

/** A rule's Undo whose charge would not wait in Needs a home, by the same test that list uses; other kinds keep naming what they take apart. */
const isLeftInFreeToSpend = (
  undo: DoneForYouUndo,
  sorting: SortingState | null,
) => undo.kind === 'rule' && isQuietBySorting(undo.placed, sorting);

/** The Undo button names what it puts back. */
const getUndoLabel = (undo: DoneForYouUndo, sorting: SortingState | null) => {
  if (isLeftInFreeToSpend(undo, sorting)) return DONE_FOR_YOU_WORDS.undoQuiet;
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
    case 'storeRefund':
      return STORE_ORDER_WORDS.undoRefund;
    case 'storeCancel':
      return STORE_ORDER_WORDS.undoCancel;
  }
};

const getUndoneWords = (undo: DoneForYouUndo, sorting: SortingState | null) => {
  if (isLeftInFreeToSpend(undo, sorting)) return DONE_FOR_YOU_WORDS.undoneQuiet;
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
    case 'storeRefund':
      return STORE_ORDER_WORDS.refundUndoneSummary(
        undo.applied.merchant ?? STORE_ORDER_WORDS.store,
      );
    case 'storeCancel':
      return STORE_ORDER_WORDS.cancelUndoneSummary(
        undo.written.merchant ?? STORE_ORDER_WORDS.store,
      );
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
    case 'storeRefund':
      await undoStoreRefund(
        uid,
        encryption,
        undo.applied,
        STORE_ORDER_WORDS.refundUndoneSummary(
          undo.applied.merchant ?? STORE_ORDER_WORDS.store,
        ),
      );
      return;
    case 'storeCancel':
      await undoTakeOff(
        uid,
        encryption,
        undo.before,
        undo.written,
        undo.cancel,
        undo.emailEventId,
        STORE_ORDER_WORDS.cancelUndoneSummary(
          undo.written.merchant ?? STORE_ORDER_WORDS.store,
        ),
      );
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
  const sorting = useAppSelector(selectSorting);
  const level = useAppSelector(selectLevel);
  const rules = useAppSelector(selectRules);
  const isRulesLoaded = useAppSelector(selectIsRulesLoaded);
  const planItems = useAppSelector((state) => state.runway.items);
  const looks = useAppSelector(selectItemLooks);
  useAppSelector(selectLedgerOnlyBalances);
  const { isHidden, toggle: toggleHidden } = useValuesHidden();
  const [coverId, setCoverId] = useState<string | null>(null);
  const { leaveViewForTab, openPurchase, openView, closeView, showOnPlan } =
    useRunwayUrlState();
  const known = toKnown({
    purchases,
    needsHome: waiting,
    linkHistoryPurchases: linkHistory,
    purchasesFrom,
  });

  const now = useNow(60 * 60 * 1000);
  const cutoff = now - DONE_FOR_YOU_DAYS * DAY_MS;
  const live = entries.filter((entry) => entry.createdAt >= cutoff);
  const getDoors = (entry: OpenDoneForYou): DoneForYouDoor[] => {
    const { subject } = entry;
    if (subject === null) return [];
    const purchaseId = subject.purchaseId;
    const hasPurchase =
      purchaseId !== null &&
      known.purchases.some((purchase) => purchase.id === purchaseId);
    const purchaseDoor = (): DoneForYouDoor[] =>
      purchaseId === null || entry.kind === 'released'
        ? []
        : [
            {
              label: DONE_FOR_YOU_WORDS.openPurchase,
              subtitle: DONE_FOR_YOU_WORDS.openPurchaseSub,
              icon: <Receipt />,
              unavailable: hasPurchase
                ? undefined
                : DONE_FOR_YOU_WORDS.purchaseGone,
              onSelect: () => {
                void leaveViewForTab('spend').then(() =>
                  openPurchase(purchaseId),
                );
              },
            },
          ];
    const getItemDoor = (
      itemId: string | null,
      fallbackLabel: string,
    ): DoneForYouDoor[] => {
      if (itemId === null) return [];
      const item = planItems.find((entry) => entry.id === itemId);
      const section: PlanSection | null =
        item?.kind === 'bill'
          ? 'bills'
          : item?.kind === 'goal'
            ? 'goals'
            : item?.kind === 'envelope'
              ? 'envelopes'
              : null;
      const label =
        item?.kind === 'goal'
          ? DONE_FOR_YOU_WORDS.openGoal
          : item?.kind === 'envelope'
            ? DONE_FOR_YOU_WORDS.openEnvelope
            : fallbackLabel;
      if (item !== undefined && section === null) return [];
      const isGone = item === undefined || item.archivedAt !== null;
      return [
        {
          label,
          subtitle: DONE_FOR_YOU_WORDS.openItemSub,
          icon: <ArrowUpRight />,
          unavailable:
            isGone || section === null
              ? DONE_FOR_YOU_WORDS.itemGone
              : undefined,
          onSelect: () => {
            if (section === null) return;
            closeView();
            void showOnPlan(section, { itemId });
          },
        },
      ];
    };
    const ruleDoor = (): DoneForYouDoor[] =>
      level !== 'link' || subject.ruleId === null
        ? []
        : [
            {
              label: DONE_FOR_YOU_WORDS.seeRule,
              subtitle: DONE_FOR_YOU_WORDS.seeRuleSub,
              icon: <Repeat />,
              unavailable:
                isRulesLoaded &&
                !rules.some((rule) => rule.id === subject.ruleId)
                  ? DONE_FOR_YOU_WORDS.ruleGone
                  : undefined,
              onSelect: () => {
                const { ruleId } = subject;
                void openView('rules').then(() => setOpenRuleRequest(ruleId));
              },
            },
          ];
    const movesDoor: DoneForYouDoor = {
      label: DONE_FOR_YOU_WORDS.openMoves,
      subtitle: DONE_FOR_YOU_WORDS.openMovesSub,
      icon: <ArrowLeftRight />,
      onSelect: () => {
        void openView('accountMoves');
      },
    };
    const envelopeDoor = () =>
      getItemDoor(subject.itemId, DONE_FOR_YOU_WORDS.openEnvelope);
    const overDoor = (): DoneForYouDoor[] => {
      const placed = known.purchases.find((p) => p.id === purchaseId);
      if (
        placed === undefined ||
        purchaseId === null ||
        entry.undoneAt !== null ||
        entry.undo === null ||
        !isStillUndoable(entry.undo, known)
      )
        return [];
      const over = getPlacedOver(store.getState(), placed.lines);
      if (over === null) return [];
      return [
        {
          label: isHidden
            ? NEEDS_LOOK_WORDS.title
            : COVER_WORDS.overDoor(
                looks.get(over.envelopeId)?.name ?? 'An envelope',
              ),
          subtitle: isHidden ? NEEDS_LOOK_WORDS.door : COVER_WORDS.overDoorSub,
          icon: <TriangleAlert />,
          onSelect: () => {
            if (isHidden) toggleHidden();
            setCoverId(purchaseId);
          },
        },
      ];
    };
    switch (entry.kind) {
      case 'rule':
        return [
          ...overDoor(),
          ...ruleDoor(),
          ...envelopeDoor(),
          ...purchaseDoor(),
        ];
      case 'merge':
        return [...envelopeDoor(), ...purchaseDoor()];
      case 'deposit':
        return purchaseDoor();
      case 'pair':
        return [movesDoor];
      case 'charge':
        return [
          ...purchaseDoor(),
          ...getItemDoor(subject.billId, DONE_FOR_YOU_WORDS.openBill),
        ];
      case 'storeRefund':
      case 'storeCancel':
        return purchaseDoor();
      case 'autoMark':
        return getItemDoor(subject.billId, DONE_FOR_YOU_WORDS.openBill);
      case 'ended':
        return getItemDoor(subject.itemId, DONE_FOR_YOU_WORDS.openBill);
      default:
        return [];
    }
  };

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
      undoLabel: entry.undo === null ? null : getUndoLabel(entry.undo, sorting),
      undoneAt: entry.undoneAt,
      doors: getDoors(entry),
      ...getDoneForYouLook(entry.kind, entry.subject),
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
    if (!isStillUndoable(entry.undo, toKnown(store.getState().runway))) {
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
      description: getUndoneWords(entry.undo, selectSorting(store.getState())),
      type: 'success',
    });
    return null;
  };

  return {
    items,
    hasUnseen,
    isReady,
    undo,
    coverId,
    closeCover: () => setCoverId(null),
  };
}
