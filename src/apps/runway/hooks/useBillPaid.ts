import { useRef, useState } from 'react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import { CHECKLIST_R3_WORDS, CHECKLIST_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import type { BillPayment } from '@apps/runway/engine/demands';
import { countMarks } from '@apps/runway/engine/progress';
import { getMarkCardId } from '@apps/runway/utils/cardText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  markBillPaid,
  undoBillPaid,
  type WrittenPaidMark,
} from '@apps/runway/store/actions/moveActions';
import {
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';

/** Paid marks share the plan document, so two at once would contend and one would stall in retries; they run one after another. */
let paidWrites: Promise<unknown> = Promise.resolve();
const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
  const next = paidWrites.then(task, task);
  paidWrites = next.catch(() => undefined);
  return next;
};

/** Records a bill's payment paid today; resolves with what it wrote, or null when the payment was already paid. */
export async function markPaymentPaid(
  uid: string,
  billId: string,
  billName: string,
  payment: BillPayment,
  moves: Parameters<typeof countMarks>[0],
) {
  const encryption = await getRunwayEncryption(uid);
  const written = await inTurn(() =>
    markBillPaid(uid, encryption, {
      billId,
      billName,
      cardId: getMarkCardId(store.getState(), billId, payment.dueOn),
      dueOn: payment.dueOn,
      amountCents: payment.totalCents,
      fundedCents: payment.heldNowCents,
      paidOn: todayAsUtcDate(),
      marks: countMarks(moves, billId, payment.dueOn),
    }),
  );
  return written;
}

/** Takes a payment's paid mark back; resolves false when it had already been taken back. */
export async function undoPaymentPaid(
  uid: string,
  billId: string,
  billName: string,
  paid: Omit<WrittenPaidMark, 'billId'>,
) {
  const encryption = await getRunwayEncryption(uid);
  const isWritten = await inTurn(() =>
    undoBillPaid(
      uid,
      encryption,
      {
        moveId: paid.moveId,
        billId,
        dueOn: paid.dueOn,
        amountCents: paid.amountCents,
        paidOn: paid.paidOn,
        fromFreeCents: paid.fromFreeCents,
        cardId: paid.cardId ?? null,
      },
      billName,
    ),
  );
  return isWritten;
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
  const mask = useMaskedText();
  const { addToast } = useToast();
  const moves = useAppSelector((state) => state.runway.moves);
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false);

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
      const value = await task(user.uid);
      return { value };
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

  /** Resolves with what was written (null when the payment was already paid), or null when nothing was done. */
  const markWritten = async (): Promise<{
    mark: WrittenPaidMark | null;
  } | null> => {
    if (!payment || payment.paid) return null;
    const unfundedCents = Math.max(
      0,
      payment.totalCents - payment.heldNowCents,
    );
    if (unfundedCents > 0 && !isQuick) {
      const isConfirmed = await confirm({
        title: `Mark ${billName} paid`,
        message: `${mask(formatCents(unfundedCents))} of it is not set aside yet and comes out of Free to Spend. Later income days stop setting this payment aside.`,
        confirmText: CHECKLIST_WORDS.markPaid,
      });
      if (!isConfirmed) return null;
    }
    const done = await run(async (uid) => {
      const written = await markPaymentPaid(
        uid,
        billId,
        billName,
        payment,
        moves,
      );
      onMarked?.();
      return written;
    }, `${billName} was not marked paid`);
    return done === null ? null : { mark: done.value };
  };

  const mark = async () => (await markWritten()) !== null;

  const undo = async () => {
    const done = await run(async (uid) => {
      const paid = payment?.paid ?? null;
      if (!paid) return;
      await undoPaymentPaid(uid, billId, billName, paid);
      onUndone?.();
    }, `${billName} was not changed`);
    return done !== null;
  };

  const result = {
    isReady: isLedgerReady && payment !== null,
    isPaid: payment?.paid != null,
    isBusy,
    mark,
    markWritten,
    undo,
  };
  return result;
}
