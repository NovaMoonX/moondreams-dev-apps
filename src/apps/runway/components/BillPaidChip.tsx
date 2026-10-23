import { useState } from 'react';
import { Check, Undo2 } from 'lucide-react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionChips from '@/components/ActionChips';
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

interface BillPaidChipProps {
  billId: string;
  billName: string;
  payment: BillPayment;
  /** Runs after a mark, so a checklist can tick the line it came from. */
  onMarked?: () => void;
}

/** Marks a payment paid, ahead of its due date or not, or takes the mark back. */
function BillPaidChip({
  billId,
  billName,
  payment,
  onMarked,
}: BillPaidChipProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const moves = useAppSelector((state) => state.runway.moves);
  const [isBusy, setIsBusy] = useState(false);
  const { paid } = payment;
  const unfundedCents = Math.max(0, payment.totalCents - payment.fundedCents);

  const run = async (task: (uid: string) => Promise<void>, failure: string) => {
    if (!user || isBusy) return;
    setIsBusy(true);
    try {
      await task(user.uid);
    } catch (error) {
      addToast({
        title: failure,
        description: getErrorMessage(error, 'Nothing was changed.'),
        type: 'error',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleMark = async () => {
    if (unfundedCents > 0) {
      const isConfirmed = await confirm({
        title: `Mark ${billName} paid`,
        message: `${formatCents(unfundedCents)} of it is not set aside yet and comes out of Free to spend. Later income days stop setting this payment aside.`,
        confirmText: CHECKLIST_WORDS.markPaid,
      });
      if (!isConfirmed) return;
    }
    await run(async (uid) => {
      const encryption = await getRunwayEncryption(uid);
      await markBillPaid(uid, encryption, {
        billId,
        dueOn: payment.dueOn,
        amountCents: payment.totalCents,
        fundedCents: payment.fundedCents,
        paidOn: todayAsUtcDate(),
        marks: countMarks(moves, billId, payment.dueOn),
      });
      onMarked?.();
    }, `${billName} was not marked paid`);
  };

  const handleUndo = () =>
    run(async (uid) => {
      if (!paid) return;
      const encryption = await getRunwayEncryption(uid);
      await undoBillPaid(uid, encryption, {
        moveId: paid.moveId,
        billId,
        dueOn: paid.dueOn,
        amountCents: paid.amountCents,
        paidOn: paid.paidOn,
        fromFreeCents: paid.fromFreeCents,
      });
    }, `${billName} was not changed`);

  return (
    <ActionChips
      label={`${billName} payment`}
      actions={[
        paid
          ? {
              key: 'undo',
              icon: <Undo2 className='h-4 w-4' />,
              label: CHECKLIST_WORDS.undoPaid,
              description: `Undo: ${billName} paid`,
              isLoading: isBusy,
              onClick: handleUndo,
            }
          : {
              key: 'pay',
              icon: <Check className='h-4 w-4' />,
              label: CHECKLIST_WORDS.markPaid,
              description: `Mark ${billName} paid`,
              isLoading: isBusy,
              onClick: handleMark,
            },
      ]}
    />
  );
}

export default BillPaidChip;
