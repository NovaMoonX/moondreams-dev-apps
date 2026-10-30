import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import ItemRow, { type ItemRowReorder } from '@apps/runway/components/ItemRow';
import { useItemEmoji } from '@apps/runway/hooks/useItemEmoji';
import ItemSheet from '@apps/runway/components/ItemSheet';
import {
  BILL_WORDS,
  GROUP_WORDS,
  ITEM_SHEET_R2_WORDS,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import type { BillPayment } from '@apps/runway/engine/demands';
import { effectiveStance, pick } from '@apps/runway/engine/stance';
import type { BillSealed, Stance } from '@apps/runway/types';
import { describeBillRepeat } from '@apps/runway/utils/billText';
import { describeRange } from '@apps/runway/utils/rangeText';

interface BillRowProps {
  bill: BillSealed;
  /** The next payment and what each income day sets aside for it; null once the bill has no payment left. */
  payment: BillPayment | null;
  planStance: Stance;
  /** A one-time bill in a group: the group's monthly total leaves it out, and its row says so. */
  isOutsideTotal?: boolean;
  /** Said in the row's one line in place of the due date. */
  detailOverride?: string | null;
  reorder?: ItemRowReorder;
  isHighlighted?: boolean;
  onOpen?: () => void;
}

interface BillSheetProps {
  billId: string;
  bill: BillSealed;
  payment: BillPayment | null;
  planStance: Stance;
  today: number;
  startsAtStep?: string;
  onClose: () => void;
}

const getDueLine = (payment: BillPayment | null, isUndated: boolean) => {
  if (isUndated) return BILL_WORDS.needsDueDate;
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
  bill,
  payment,
  planStance,
  isOutsideTotal = false,
  detailOverride = null,
  reorder,
  isHighlighted = false,
  onOpen,
}: BillRowProps) {
  const stance = effectiveStance(planStance, bill.stanceOverride);
  const amount = formatCents(pick(stance, bill.amount, 'expense'));
  const isUndated = bill.timing.schedule.anchor === null;
  const emoji = useItemEmoji(bill.emoji, bill.groupId);
  const dueLine = isOutsideTotal
    ? `${getDueLine(payment, isUndated)} · ${GROUP_WORDS.oneTimeNote}`
    : getDueLine(payment, isUndated);

  return (
    <ItemRow
      name={bill.name}
      emoji={emoji}
      detail={detailOverride ?? dueLine}
      figure={amount}
      ariaLabel={`${bill.name}, ${amount}. ${dueLine}. Open`}
      onOpen={reorder ? undefined : onOpen}
      reorder={reorder}
      isHighlighted={isHighlighted}
    />
  );
}

/** A bill's sheet, drawn by the screen so it stays open when the bill's row moves to another group. */
export function BillSheet({
  billId,
  bill,
  payment,
  planStance,
  today,
  startsAtStep,
  onClose,
}: BillSheetProps) {
  const stance = effectiveStance(planStance, bill.stanceOverride);
  const amount = formatCents(pick(stance, bill.amount, 'expense'));
  const { schedule } = bill.timing;
  const isUndated = schedule.anchor === null;
  const repeat =
    schedule.kind === 'once' ? null : describeBillRepeat(schedule.kind);
  const getDueFact = () => {
    if (isUndated) return null;
    if (payment) return `due ${formatDateShortUTC(payment.dueOn)}`;
    return 'No payment left';
  };
  const fact = [
    PRIORITY_LABELS[bill.priority],
    repeat,
    getDueFact(),
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
    <ItemSheet
      itemId={billId}
      kind='bill'
      today={today}
      figureLabel={payment ? 'Next payment' : 'Each payment'}
      figure={amount}
      fact={fact}
      help={rangeText}
      quickChange={
        isUndated
          ? { label: ITEM_SHEET_R2_WORDS.setDueDate, step: 'due' }
          : { label: ITEM_SHEET_R2_WORDS.changeAmount, step: 'amount' }
      }
      startsAtStep={startsAtStep}
      payment={payment}
      onClose={onClose}
    />
  );
}

export default BillRow;
