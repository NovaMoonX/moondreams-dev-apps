import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import PriorityBadge from '@apps/runway/components/PriorityBadge';
import type { BillPayment } from '@apps/runway/engine/demands';
import RangeNote from '@apps/runway/components/RangeNote';
import { effectiveStance, pick } from '@apps/runway/engine/stance';
import type { BillSealed, Stance } from '@apps/runway/types';
import {
  describeBillFunding,
  describeBillRepeat,
} from '@apps/runway/utils/billText';

interface BillRowProps {
  bill: BillSealed;
  /** The next payment and what each income day sets aside for it; null once the bill has no payment left. */
  payment: BillPayment | null;
  planStance: Stance;
}

/** A bill in the plan: its name and amount, when it is next due, and how that payment is funded. */
function BillRow({ bill, payment, planStance }: BillRowProps) {
  const stance = effectiveStance(planStance, bill.stanceOverride);
  const { schedule } = bill.timing;
  const repeats =
    schedule.kind === 'once'
      ? ''
      : ` · ${describeBillRepeat(schedule.kind).toLowerCase()}`;
  const dueText = payment
    ? `Next due ${formatDateUTC(payment.dueOn)}${repeats}`
    : 'No payment left';

  return (
    <li className='flex items-start gap-3 p-3'>
      <ItemBadge name={bill.name} emoji={bill.emoji} />
      <div className='min-h-10 min-w-0 flex-1'>
        <div className='flex min-h-10 items-start justify-between gap-2'>
          <p className='line-clamp-2 min-w-0 pt-2 font-medium break-words'>
            {bill.name}
          </p>
          <p className='shrink-0 pt-2 font-semibold whitespace-nowrap tabular-nums'>
            {formatCents(pick(stance, bill.amount, 'expense'))}
          </p>
        </div>
        <RangeNote
          range={bill.amount}
          stance={stance}
          side='expense'
          isOwnStance={Boolean(bill.stanceOverride)}
        />
        <p className='text-muted-foreground text-sm'>{dueText}</p>
        {payment && (
          <p className='text-muted-foreground text-sm'>
            {describeBillFunding(payment, bill.fundedBy)}
          </p>
        )}
        <div className='pt-1'>
          <PriorityBadge priority={bill.priority} />
        </div>
      </div>
    </li>
  );
}

export default BillRow;
