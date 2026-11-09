import { useRef, useState } from 'react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import {
  CHECKLIST_R3_WORDS,
  CHECKLIST_WORDS,
  COST_PAID_WORDS,
  HORIZON_END_WORDS,
  ITEM_SHEET_R2_WORDS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  needsCostAmount,
  settleCostPaidWithGoal,
  type CostPaidEntry,
  type CostPayment,
} from '@apps/runway/engine/horizon';
import { countCostMarks } from '@apps/runway/engine/progress';
import type { PaidAmountPayment } from '@apps/runway/hooks/paidAmountPayment';
import { inTurn } from '@apps/runway/hooks/paidQueue';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  markCostPaid,
  undoCostPaid,
  type WrittenCostPaid,
} from '@apps/runway/store/actions/horizonActions';
import { removePurchaseOfCost } from '@apps/runway/store/actions/purchaseActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectAllHorizonItems,
  isGoalCovering,
  selectGoals,
  selectItemNames,
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { Cents, HorizonCost } from '@apps/runway/types';

/** The event when it is finished or called off: taking one of its paid marks back reopens a finished one and is refused on a called-off one. */
export const getFinishedHorizon = (itemId: string) => {
  const found = selectAllHorizonItems(store.getState(), todayAsUtcDate()).find(
    ({ item }) => item.id === itemId,
  );
  return found && found.version.payload.state !== 'open'
    ? { horizon: found.version.payload, versionId: found.version.id }
    : null;
};

/** "Moving opens again." when taking a mark back would reopen a finished event; null otherwise. */
export const getOpensAgainNote = (itemId: string) => {
  const done = getFinishedHorizon(itemId);
  return done?.horizon.state === 'finished'
    ? HORIZON_END_WORDS.opensAgain(done.horizon.name)
    : null;
};

/** Why a paid mark cannot be taken back while the event is called off; null when it can. */
export const getTakeBackBlock = (itemId: string) => {
  const done = getFinishedHorizon(itemId);
  return done?.horizon.state === 'calledOff'
    ? HORIZON_END_WORDS.calledOffTakeBack(done.horizon.name)
    : null;
};

/** Why a paid mark cannot be taken back when the goal that paid part of it is archived or ended, so it cannot take the money back; null when it can. The amount is for the caller to mask. */
export const getGoalClosedBlock = (
  paid: Pick<CostPaidEntry, 'goalId' | 'fromGoalCents'>,
  storedName: string | null = null,
) => {
  if (paid.goalId === null || paid.fromGoalCents <= 0) return null;
  const state = store.getState();
  const today = todayAsUtcDate();
  const goalId = paid.goalId;
  const isOpen = selectGoals(state, today).some(
    ({ item }) => item.id === goalId && isGoalCovering(item, today),
  );
  return isOpen
    ? null
    : COST_PAID_WORDS.goalClosedTakeBack(
        getGoalNameOf(goalId, storedName),
        formatCents(paid.fromGoalCents),
      );
};

const getHeldNow = (itemId: string) =>
  selectBalances(store.getState()).assignedByItem[itemId] ?? 0;

/** The goal an open event draws its costs from, with what it holds now; null when it has none. */
const getGoalNow = (itemId: string) => {
  const today = todayAsUtcDate();
  const state = store.getState();
  const event = selectAllHorizonItems(state, today).find(
    ({ item }) => item.id === itemId,
  );
  const goalId =
    event && event.version.payload.state === 'open'
      ? event.version.payload.goalId
      : null;
  const goal =
    goalId === null
      ? undefined
      : selectGoals(state, today).find(
          ({ item }) => item.id === goalId && isGoalCovering(item, today),
        );
  return goalId === null || !goal
    ? null
    : {
        goalId,
        goalName: goal.version.payload.name,
        heldCents: selectBalances(state).assignedByItem[goalId] ?? 0,
      };
};

/** The goal's name for a History line: its name on the plan today, else the one stored with the mark, else the newest name it ever had. */
const getGoalNameOf = (goalId: string, storedName: string | null) =>
  selectGoals(store.getState(), todayAsUtcDate()).find(
    ({ item }) => item.id === goalId,
  )?.version.payload.name ??
  storedName ??
  selectItemNames(store.getState()).find(({ id }) => id === goalId)?.name ??
  COST_PAID_WORDS.goalFallbackName;

/** Takes a cost payment's paid mark back, removing the purchase that made it; resolves false when it had already been taken back. */
export async function undoCostPayment(
  uid: string,
  itemId: string,
  names: { item: string; cost: string; goal?: string | null },
  paid: CostPaidEntry,
) {
  const encryption = await getRunwayEncryption(uid);
  const written: WrittenCostPaid = { ...paid, itemId };
  const blocked = getGoalClosedBlock(paid, names.goal ?? null);
  if (blocked !== null) throw new Error(blocked);
  const goalName =
    paid.goalId === null
      ? null
      : getGoalNameOf(paid.goalId, names.goal ?? null);
  const withGoal = { ...names, goal: goalName };
  return inTurn(() =>
    paid.mark === 'purchase'
      ? removePurchaseOfCost(
          uid,
          encryption,
          written,
          withGoal,
          getFinishedHorizon(itemId),
        )
      : undoCostPaid(
          uid,
          encryption,
          written,
          withGoal,
          getFinishedHorizon(itemId),
        ),
  );
}

interface UseCostPaidOptions {
  itemId: string;
  itemName: string;
  cost: HorizonCost;
  /** The payment being marked or taken back; null when the cost has none to mark. */
  payment: CostPayment | null;
}

/** Marks one payment of a cost paid out of its item's money (or outside the plan), or takes the mark back; `isReady` is false until the ledger has loaded. */
export function useCostPaid({
  itemId,
  itemName,
  cost,
  payment,
}: UseCostPaidOptions) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const mask = useMaskedText();
  const { isHidden } = useValuesHidden();
  const { addToast } = useToast();
  const moves = useAppSelector((state) => state.runway.moves);
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false);
  const needsAmount = needsCostAmount(cost);
  const mark = cost.isOutside ? 'outside' : 'item';

  const run = async <T>(
    task: (uid: string) => Promise<T>,
    failure: string,
  ): Promise<{ value: T } | null> => {
    if (!user || isBusyRef.current) return null;
    if (!navigator.onLine) {
      addToast({
        title: failure,
        description: CHECKLIST_R3_WORDS.needsConnection,
        type: 'error',
      });
      return null;
    }
    isBusyRef.current = true;
    setIsBusy(true);
    try {
      return { value: await task(user.uid) };
    } catch (error) {
      addToast({
        title: failure,
        description:
          !navigator.onLine ||
          /offline|unavailable/i.test(
            error instanceof Error ? error.message : '',
          )
            ? CHECKLIST_R3_WORDS.needsConnection
            : getErrorMessage(error, 'Nothing was changed.'),
        type: 'error',
      });
      return null;
    } finally {
      isBusyRef.current = false;
      setIsBusy(false);
    }
  };

  const takeBack = async (paid: CostPaidEntry) => {
    const closedBlock = getGoalClosedBlock(paid);
    if (closedBlock !== null) {
      addToast({
        title: COST_PAID_WORDS.notChanged(cost.name),
        description: mask(closedBlock),
        type: 'error',
      });
      return false;
    }
    const done = await run(
      (uid) =>
        undoCostPayment(uid, itemId, { item: itemName, cost: cost.name }, paid),
      COST_PAID_WORDS.notChanged(cost.name),
    );
    if (done === null) return false;
    if (done.value) {
      addToast({ title: COST_PAID_WORDS.unmarked(cost.name), type: 'success' });
    } else
      addToast({
        title: COST_PAID_WORDS.alreadyTakenBack(cost.name),
        type: 'info',
      });
    return done.value;
  };

  const announce = (written: WrittenCostPaid) => {
    const fromItemCents = written.amountCents - written.fromFreeCents;
    addToast({
      title: mask(
        written.mark === 'outside'
          ? COST_PAID_WORDS.markedOutside(cost.name)
          : fromItemCents > 0
            ? COST_PAID_WORDS.markedFrom(
                cost.name,
                formatCents(fromItemCents),
                itemName,
              )
            : COST_PAID_WORDS.marked(cost.name),
      ),
      description:
        written.fromFreeCents > 0
          ? mask(COST_PAID_WORDS.fromFree(formatCents(written.fromFreeCents)))
          : undefined,
      type: 'success',
      action: {
        label: ITEM_SHEET_R2_WORDS.undo,
        onClick: () => void takeBack(written),
      },
    });
  };

  /** What comes out of Free to Spend for a payment of `total`: when the person is asked, the part they agreed to. The split is read again once they answer and asked again if it changed. Resolves null when they decline or another tap holds the confirm. */
  const settleFrom = async (
    total: Cents,
    isAsked: boolean,
    askedCents?: Cents,
  ): Promise<Cents | null> => {
    const goalNow = getGoalNow(itemId);
    const { fromGoalCents, fromItemCents, fromFreeCents } =
      settleCostPaidWithGoal(
        total,
        goalNow?.heldCents ?? 0,
        getHeldNow(itemId),
        mark,
      );
    if (!isAsked || fromFreeCents === 0 || fromFreeCents === askedCents) {
      return fromFreeCents;
    }
    if (isBusyRef.current) return null;
    isBusyRef.current = true;
    const isConfirmed = await confirm({
      title: COST_PAID_WORDS.confirmTitle(cost.name),
      message: mask(
        COST_PAID_WORDS.confirmMark(
          cost.name,
          formatCents(total),
          fromGoalCents > 0 && fromItemCents === 0 ? '' : itemName,
          fromGoalCents + fromItemCents > 0 || isHidden
            ? formatCents(fromGoalCents + fromItemCents)
            : null,
          formatCents(fromFreeCents),
          fromGoalCents > 0 ? (goalNow?.goalName ?? null) : null,
        ),
      ),
      confirmText: CHECKLIST_WORDS.markPaid,
    }).finally(() => {
      isBusyRef.current = false;
    });
    return isConfirmed ? settleFrom(total, true, fromFreeCents) : null;
  };

  /** What the event's linked goal pays of a payment: its balance first, so the part Free to Spend fronts is what neither holds. Null when there is no goal or nothing to take. */
  const getGoalPart = (total: Cents, fromFreeCents: Cents) => {
    const goal = mark === 'item' ? getGoalNow(itemId) : null;
    if (goal === null) return null;
    const cents = Math.min(
      Math.max(0, goal.heldCents),
      Math.max(0, total - fromFreeCents),
    );
    return cents > 0
      ? { goalId: goal.goalId, goalName: goal.goalName, cents }
      : null;
  };

  /** Marks the payment paid, at `amountCents` when given (a range is only ever marked with what it came to); resolves true once it is written or was already there. A part that comes out of Free to Spend is confirmed first unless the person already saw it in the amount sheet; the figure written is the one confirmed. */
  const markPaid = async (amountCents?: Cents) => {
    if (!payment || payment.paid) return false;
    if (amountCents === undefined && needsAmount) return false;
    const total = amountCents ?? payment.totalCents;
    const fromFreeCents = await settleFrom(total, amountCents === undefined);
    if (fromFreeCents === null) return false;
    const done = await run(async (uid) => {
      const encryption = await getRunwayEncryption(uid);
      return inTurn(() =>
        markCostPaid(uid, encryption, {
          itemId,
          itemName,
          costId: cost.id,
          costName: cost.name,
          dueOn: payment.dueOn,
          amountCents: total,
          fromFreeCents,
          goal: getGoalPart(total, fromFreeCents),
          paidOn: todayAsUtcDate(),
          mark,
          marks: countCostMarks(moves, itemId, cost.id, payment.dueOn),
        }),
      );
    }, COST_PAID_WORDS.failed(cost.name));
    if (done === null) return false;
    if (done.value === null) {
      addToast({
        title: COST_PAID_WORDS.alreadyPaid(cost.name),
        type: 'info',
      });
      return true;
    }
    announce(done.value);
    return true;
  };

  const undo = async () => (payment?.paid ? takeBack(payment.paid) : false);

  /** What the amount sheet reads for a cost whose price varies; the money left over stays with the event. */
  const toAmountPayment = (): PaidAmountPayment | null =>
    payment === null
      ? null
      : {
          name: cost.name,
          keeperName: itemName,
          range: needsAmount ? cost.amount : null,
          heldMostCents: cost.isOutside
            ? 0
            : getHeldNow(itemId) + (getGoalNow(itemId)?.heldCents ?? 0),
          getHeldCents: (amountCents) =>
            cost.isOutside
              ? amountCents
              : Math.min(
                  amountCents,
                  getHeldNow(itemId) +
                    Math.max(0, getGoalNow(itemId)?.heldCents ?? 0),
                ),
          isPaid: payment.paid !== null,
          cardName: null,
        };

  return {
    isReady: isLedgerReady && payment !== null,
    isPaid: payment?.paid != null,
    needsAmount,
    isBusy,
    mark: markPaid,
    undo,
    takeBack,
    toAmountPayment,
  };
}
