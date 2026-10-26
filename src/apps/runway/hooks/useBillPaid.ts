import { useRef, useState } from 'react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import { CHECKLIST_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import type { BillPayment } from '@apps/runway/engine/demands';
import { countMarks } from '@apps/runway/engine/progress';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  markBillPaid,
  undoBillPaid,
} from '@apps/runway/store/actions/moveActions';
import {
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';

/** Records a bill's payment paid today. */
export async function markPaymentPaid(
  uid: string,
  billId: string,
  payment: BillPayment,
  moves: Parameters<typeof countMarks>[0],
) {
  const encryption = await getRunwayEncryption(uid);
  await markBillPaid(uid, encryption, {
    billId,
    dueOn: payment.dueOn,
    amountCents: payment.totalCents,
    fundedCents: payment.fundedCents,
    paidOn: todayAsUtcDate(),
    marks: countMarks(moves, billId, payment.dueOn),
  });
}

/** Takes a payment's paid mark back. */
export async function undoPaymentPaid(
  uid: string,
  billId: string,
  paid: NonNullable<BillPayment['paid']>,
) {
  const encryption = await getRunwayEncryption(uid);
  await undoBillPaid(uid, encryption, {
    moveId: paid.moveId,
    billId,
    dueOn: paid.dueOn,
    amountCents: paid.amountCents,
    paidOn: paid.paidOn,
    fromFreeCents: paid.fromFreeCents,
  });
}

interface UseBillPaidOptions {
  billId: string;
  billName: string;
  payment: BillPayment | null;
  /** Runs after a mark, so a checklist can tick the line it came from. */
  onMarked?: () => void;
  /** Runs after an undo, so a checklist can untick the line it marked. */
  onUndone?: () => void;
  /** A tick that an Undo toast can take back asks no confirm. */
  isQuick?: boolean;
}

/** Marks a bill's payment paid, ahead of its due date or not, or takes the mark back; `isReady` is false until the ledger has loaded. */
export function useBillPaid({
  billId,
  billName,
  payment,
  onMarked,
  onUndone,
  isQuick = false,
}: UseBillPaidOptions) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const moves = useAppSelector((state) => state.runway.moves);
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false);

  const run = async (task: (uid: string) => Promise<void>, failure: string) => {
    if (!user || isBusyRef.current) return false;
    isBusyRef.current = true;
    setIsBusy(true);
    try {
      await task(user.uid);
      return true;
    } catch (error) {
      addToast({
        title: failure,
        description: getErrorMessage(error, 'Nothing was changed.'),
        type: 'error',
      });
      return false;
    } finally {
      isBusyRef.current = false;
      setIsBusy(false);
    }
  };

  const mark = async () => {
    if (!payment || payment.paid) return false;
    const unfundedCents = Math.max(0, payment.totalCents - payment.fundedCents);
    if (unfundedCents > 0 && !isQuick) {
      const isConfirmed = await confirm({
        title: `Mark ${billName} paid`,
        message: `${formatCents(unfundedCents)} of it is not set aside yet and comes out of Free to spend. Later income days stop setting this payment aside.`,
        confirmText: CHECKLIST_WORDS.markPaid,
      });
      if (!isConfirmed) return false;
    }
    const isDone = await run(async (uid) => {
      await markPaymentPaid(uid, billId, payment, moves);
      onMarked?.();
    }, `${billName} was not marked paid`);
    return isDone;
  };

  const undo = () =>
    run(async (uid) => {
      const paid = payment?.paid ?? null;
      if (!paid) return;
      await undoPaymentPaid(uid, billId, paid);
      onUndone?.();
    }, `${billName} was not changed`);

  const result = {
    isReady: isLedgerReady && payment !== null,
    isPaid: payment?.paid != null,
    isBusy,
    mark,
    undo,
  };
  return result;
}
