import { useState } from 'react';

import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import ItemRow, { type ItemRowReorder } from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import { ITEM_SHEET_R2_WORDS, PRIORITY_LABELS } from '@apps/runway/constants';
import type { BillPayment } from '@apps/runway/engine/demands';
import { effectiveStance, pick } from '@apps/runway/engine/stance';
import type { BillSealed, Stance } from '@apps/runway/types';
import { describeBillRepeat } from '@apps/runway/utils/billText';
import { describeRange } from '@apps/runway/utils/rangeText';

interface BillRowProps {
  billId: string;
  bill: BillSealed;
  /** The next payment and what each income day sets aside for it; null once the bill has no payment left. */
  payment: BillPayment | null;
  planStance: Stance;
  today: number;
  /** Said in the row's one line in place of the due date. */
  detailOverride?: string | null;
  reorder?: ItemRowReorder;
}

const getDueLine = (payment: BillPayment | null) => {
  if (!payment) return 'No payment left';
  const date = formatDateShortUTC(payment.dueOn);
  return payment.paid ? `Paid · due ${date}` : `Due ${date}`;
};

/** Where the next payment stands, short: "$1,075 of $1,250 set aside". */
const getProgress = (payment: BillPayment | null) => {
  if (!payment) return null;
  const { paid, fundedCents, totalCents } = payment;
  if (paid) {
    return `${paid.paidOn < payment.dueOn ? 'Paid ahead' : 'Paid'} ${formatDateShortUTC(paid.paidOn)}`;
  }
  if (fundedCents <= 0) return 'Nothing set aside yet';
  if (fundedCents >= totalCents) return 'Set aside in full';
  return `${formatCentsShort(fundedCents)} of ${formatCentsShort(totalCents)} set aside`;
};

/** A bill in the plan: its name, when it is next due and its amount; it opens the bill's sheet. */
function BillRow({
  billId,
  bill,
  payment,
  planStance,
  today,
  detailOverride = null,
  reorder,
}: BillRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const stance = effectiveStance(planStance, bill.stanceOverride);
  const amount = formatCents(pick(stance, bill.amount, 'expense'));
  const dueLine = getDueLine(payment);
  const { schedule } = bill.timing;
  const repeat =
    schedule.kind === 'once' ? null : describeBillRepeat(schedule.kind);
  const fact = [
    PRIORITY_LABELS[bill.priority],
    repeat,
    payment ? `due ${formatDateShortUTC(payment.dueOn)}` : 'No payment left',
    getProgress(payment),
  ]
    .filter(Boolean)
    .join(' · ');
  const rangeText = describeRange(
    bill.amount,
    stance,
    'expense',
    Boolean(bill.stanceOverride),
  );

  return (
    <>
      <ItemRow
        name={bill.name}
        emoji={bill.emoji}
        detail={detailOverride ?? dueLine}
        figure={amount}
        ariaLabel={`${bill.name}, ${amount}. ${dueLine}. Open`}
        onOpen={reorder ? undefined : () => setIsOpen(true)}
        reorder={reorder}
      />
      {isOpen && (
        <ItemSheet
          itemId={billId}
          kind='bill'
          today={today}
          figureLabel={payment ? 'Next payment' : 'Each payment'}
          figure={amount}
          fact={fact}
          help={rangeText}
          quickChange={{
            label: ITEM_SHEET_R2_WORDS.changeAmount,
            step: 'amount',
          }}
          payment={payment}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default BillRow;
