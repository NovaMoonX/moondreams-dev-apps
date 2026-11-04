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
  ITEM_SHEET_R2_WORDS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  needsCostAmount,
  settleCostPaid,
  type CostPaidEntry,
  type CostPayment,
} from '@apps/runway/engine/horizon';
import { countCostMarks } from '@apps/runway/engine/progress';
import type { PaidAmountPayment } from '@apps/runway/hooks/paidAmountPayment';
import { inTurn } from '@apps/runway/hooks/paidQueue';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  markCostPaid,
  undoCostPaid,
  type WrittenCostPaid,
} from '@apps/runway/store/actions/horizonActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { Cents, HorizonCost } from '@apps/runway/types';

const getHeldNow = (itemId: string) =>
  selectBalances(store.getState()).assignedByItem[itemId] ?? 0;

/** Takes a cost payment's paid mark back; resolves false when it had already been taken back. */
export async function undoCostPayment(
  uid: string,
  itemId: string,
  names: { item: string; cost: string },
  paid: CostPaidEntry,
) {
  const encryption = await getRunwayEncryption(uid);
  const written: WrittenCostPaid = { ...paid, itemId };
  return inTurn(() => undoCostPaid(uid, encryption, written, names));
}

interface UseCostPaidOptions {
  itemId: string;
  itemName: string;
  cost: HorizonCost;
  /** The payment being marked or taken back; null when the cost has none to mark. */
  payment: CostPayment | null;
  /** Runs after a mark, so a checklist can tick the line it came from. */
  onMarked?: () => void;
  /** Runs after an undo, so a checklist can untick the line it marked. */
  onUndone?: () => void;
}

/** Marks one payment of a cost paid out of its item's money (or outside the plan), or takes the mark back; `isReady` is false until the ledger has loaded. */
export function useCostPaid({
  itemId,
  itemName,
  cost,
  payment,
  onMarked,
  onUndone,
}: UseCostPaidOptions) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const mask = useMaskedText();
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
    const done = await run(
      (uid) =>
        undoCostPayment(uid, itemId, { item: itemName, cost: cost.name }, paid),
      COST_PAID_WORDS.notChanged(cost.name),
    );
    if (done === null) return false;
    if (done.value) {
      onUndone?.();
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

  /** Marks the payment paid, at `amountCents` when given (a range is only ever marked with what it came to); resolves true once it is written or was already there. A part that comes out of Free to Spend is confirmed first unless the person already saw it in the amount sheet. */
  const markPaid = async (amountCents?: Cents) => {
    if (!payment || payment.paid) return false;
    if (amountCents === undefined && needsAmount) return false;
    const total = amountCents ?? payment.totalCents;
    const { fromItemCents, fromFreeCents } = settleCostPaid(
      total,
      getHeldNow(itemId),
      mark,
    );
    if (fromFreeCents > 0 && amountCents === undefined) {
      const isConfirmed = await confirm({
        title: COST_PAID_WORDS.confirmTitle(cost.name),
        message: mask(
          COST_PAID_WORDS.confirmMark(
            itemName,
            formatCents(fromItemCents),
            formatCents(fromFreeCents),
          ),
        ),
        confirmText: CHECKLIST_WORDS.markPaid,
      });
      if (!isConfirmed) return false;
    }
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
          fromFreeCents: settleCostPaid(total, getHeldNow(itemId), mark)
            .fromFreeCents,
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
    onMarked?.();
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
          heldMostCents: cost.isOutside ? 0 : getHeldNow(itemId),
          getHeldCents: (amountCents) =>
            cost.isOutside
              ? amountCents
              : Math.min(amountCents, getHeldNow(itemId)),
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
