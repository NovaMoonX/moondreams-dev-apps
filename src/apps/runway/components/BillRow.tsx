import { useState } from 'react';

import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemRow from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import RangeNote from '@apps/runway/components/RangeNote';
import { PRIORITY_LABELS } from '@apps/runway/constants';
import type { BillPayment } from '@apps/runway/engine/demands';
import { effectiveStance, pick } from '@apps/runway/engine/stance';
import type { BillSealed, Stance } from '@apps/runway/types';
import {
  describeBillFunding,
  describeBillProgress,
  describeBillRepeat,
} from '@apps/runway/utils/billText';

interface BillRowProps {
  billId: string;
  bill: BillSealed;
  /** The next payment and what each income day sets aside for it; null once the bill has no payment left. */
  payment: BillPayment | null;
  planStance: Stance;
  today: number;
}

const getDueLine = (payment: BillPayment | null) => {
  if (!payment) return 'No payment left';
  const due = `Due ${formatDateUTC(payment.dueOn)}`;
  return payment.paid ? `Paid, due ${formatDateUTC(payment.dueOn)}` : due;
};

/** A bill in the plan: its name, when it is next due and its amount; it opens the bill's sheet. */
function BillRow({ billId, bill, payment, planStance, today }: BillRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const stance = effectiveStance(planStance, bill.stanceOverride);
  const amount = formatCents(pick(stance, bill.amount, 'expense'));
  const dueLine = getDueLine(payment);
  const { schedule } = bill.timing;
  const isSettled =
    payment !== null &&
    (payment.paid !== null || payment.fundedCents >= payment.totalCents);
  const progress = payment
    ? (describeBillProgress(payment) ??
      (isSettled ? null : describeBillFunding(payment, bill.fundedBy)))
    : null;
  const when =
    schedule.kind === 'once'
      ? dueLine
      : `${describeBillRepeat(schedule.kind)}. ${dueLine}`;

  return (
    <>
      <ItemRow
        name={bill.name}
        emoji={bill.emoji}
        detail={dueLine}
        figure={amount}
        ariaLabel={`${bill.name}, ${amount}. ${dueLine}. Open`}
        onOpen={() => setIsOpen(true)}
      />
      {isOpen && (
        <ItemSheet
          itemId={billId}
          kind='bill'
          today={today}
          figureLabel={payment ? 'Next payment' : 'Each payment'}
          figure={amount}
          facts={[`${PRIORITY_LABELS[bill.priority]}. ${when}`, progress]}
          note={
            <RangeNote
              range={bill.amount}
              stance={stance}
              side='expense'
              isOwnStance={Boolean(bill.stanceOverride)}
            />
          }
          payment={payment}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default BillRow;
