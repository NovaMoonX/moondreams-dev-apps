import { useState } from 'react';

import {
  formatDateOrdinalUTC,
  formatRelativeDayUTC,
} from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import ItemRow, { type ItemRowReorder } from '@apps/runway/components/ItemRow';
import { useItemEmoji } from '@apps/runway/hooks/useItemEmoji';
import ItemSheet, {
  type ItemSheetProps,
} from '@apps/runway/components/ItemSheet';
import BillPaidFromNotice from '@apps/runway/components/BillPaidFromNotice';
import {
  BILL_WORDS,
  GROUP_WORDS,
  ITEM_SHEET_R2_WORDS,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import type { BillPayment } from '@apps/runway/engine/demands';
import { effectiveStance, pick } from '@apps/runway/engine/stance';
import type { BillSealed, Stance } from '@apps/runway/types';
import {
  describeBillMonthly,
  describeBillRepeat,
  isSavingUpBill,
  isUndatedBill,
  joinPaymentAndState,
} from '@apps/runway/utils/billText';
import { usePaidFromAction } from '@apps/runway/hooks/usePaidFromAction';
import { describeRange } from '@apps/runway/utils/rangeText';

interface BillRowProps {
  bill: BillSealed;
  /** The next payment and what each income day sets aside for it; null once the bill has no payment left. */
  payment: BillPayment | null;
  planStance: Stance;
  today: number;
  /** A one-time bill in a group: the group's monthly total leaves it out, and its row says so. */
  isOutsideTotal?: boolean;
  /** Said in the row's one line in place of the due date. */
  detailOverride?: string | null;
  /** Which figure leads: what it comes to a month, or the payment. */
  figureKind?: 'monthly' | 'payment';
  reorder?: ItemRowReorder;
  isHighlighted?: boolean;
  isFaded?: boolean;
  /** Lets a warning elsewhere scroll this row into view. */
  itemId?: string;
  onOpen?: () => void;
}

interface BillSheetProps {
  billId: string;
  bill: BillSealed;
  payment: BillPayment | null;
  planStance: Stance;
  today: number;
  startsAtStep?: string;
  /** An action that opens first for a change that belongs to an income day. */
  dayAction?: ItemSheetProps['dayAction'];
  onClose: () => void;
}

const getDueLine = (
  payment: BillPayment | null,
  isUndated: boolean,
  today: number,
  isSavingUp: boolean,
) => {
  if (isUndated) return BILL_WORDS.needsDueDate;
  if (!payment) return 'No payment left';
  const date = formatRelativeDayUTC(payment.dueOn, today, formatDateOrdinalUTC);
  if (payment.paid) return `Paid · due\u00a0${date}`;
  return isSavingUp
    ? `${BILL_WORDS.savingUp} · due\u00a0${date}`
    : `Due\u00a0${date}`;
};

/** Where the next payment stands, short: "$1,075 of $1,250 set aside", or "saved" for a bill saved up for. */
const getProgress = (payment: BillPayment | null, isSavingUp: boolean) => {
  if (!payment) return null;
  const { paid, fundedCents, totalCents } = payment;
  if (paid) {
    return `${paid.paidOn < payment.dueOn ? 'Paid ahead' : 'Paid'} ${formatDateOrdinalUTC(paid.paidOn)}`;
  }
  if (fundedCents <= 0)
    return isSavingUp ? BILL_WORDS.nothingSaved : 'Nothing set aside yet';
  if (fundedCents >= totalCents) return 'Set aside in full';
  const cents = formatCentsShort(fundedCents);
  const total = formatCentsShort(totalCents);
  return isSavingUp
    ? BILL_WORDS.saved(cents, total)
    : `${cents} of ${total} set aside`;
};

/** A bill in the plan: its name, when it is next due and its amount; it opens the bill's sheet. */
function BillRow({
  bill,
  payment,
  planStance,
  today,
  isOutsideTotal = false,
  detailOverride = null,
  figureKind = 'monthly',
  reorder,
  isHighlighted = false,
  isFaded = false,
  onOpen,
  itemId,
}: BillRowProps) {
  const stance = effectiveStance(planStance, bill.stanceOverride);
  const cents = pick(stance, bill.amount, 'expense');
  const monthly =
    figureKind === 'monthly'
      ? describeBillMonthly(
          { lowCents: cents, highCents: cents },
          bill.timing.schedule,
        )
      : null;
  const amount = monthly?.figure ?? formatCents(cents);
  const isUndated = isUndatedBill(bill);
  const isSavingUp = isSavingUpBill(bill.timing.schedule, bill.fundedBy);
  const emoji = useItemEmoji(bill.emoji, bill.groupId);
  const stateLine = getDueLine(
    payment,
    isUndated,
    today,
    isSavingUp && monthly === null,
  );
  const figureWord = monthly
    ? BILL_WORDS.aMonth
    : figureKind === 'monthly' && bill.timing.schedule.kind === 'once'
      ? BILL_WORDS.once
      : null;
  const dueLine = isOutsideTotal
    ? `${stateLine} · ${GROUP_WORDS.oneTimeNote}`
    : monthly
      ? joinPaymentAndState(monthly.payment, stateLine)
      : stateLine;

  return (
    <ItemRow
      name={bill.name}
      emoji={emoji}
      detail={detailOverride ?? dueLine}
      isDetailWarning={isUndated && detailOverride === null}
      figure={amount}
      figureWord={figureWord}
      ariaLabel={`${bill.name}, ${amount}${figureWord ? ` ${figureWord}` : ''}. ${dueLine}. Open`}
      onOpen={reorder ? undefined : onOpen}
      reorder={reorder}
      isHighlighted={isHighlighted}
      isFaded={isFaded}
      itemId={itemId}
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
  dayAction,
  onClose,
}: BillSheetProps) {
  const [pickedStep, setPickedStep] = useState<string | null>(null);
  const paidFromAction = usePaidFromAction(billId, today);
  const stance = effectiveStance(planStance, bill.stanceOverride);
  const amount = formatCents(pick(stance, bill.amount, 'expense'));
  const { schedule } = bill.timing;
  const isUndated = schedule.anchor === null;
  const isSavingUp = isSavingUpBill(schedule, bill.fundedBy);
  const repeat = schedule.kind === 'once' ? null : describeBillRepeat(schedule);
  const getDueFact = () => {
    if (isUndated) return null;
    if (payment)
      return `due\u00a0${formatRelativeDayUTC(payment.dueOn, today, formatDateOrdinalUTC)}`;
    return 'No payment left';
  };
  const fact = [
    PRIORITY_LABELS[bill.priority],
    repeat,
    getDueFact(),
    getProgress(payment, isSavingUp),
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
      figureLabel={
        payment && !payment.paid && isSavingUp
          ? BILL_WORDS.savingUpFor
          : payment
            ? 'Next payment'
            : 'Each payment'
      }
      figure={amount}
      fact={fact}
      help={rangeText}
      quickChange={
        isUndated
          ? { label: ITEM_SHEET_R2_WORDS.setDueDate, step: 'due' }
          : {
              label: ITEM_SHEET_R2_WORDS.change,
              subtitle: ITEM_SHEET_R2_WORDS.changeBillSub,
              step: 'amount',
            }
      }
      maxAction={paidFromAction}
      dayAction={dayAction}
      key={pickedStep ?? 'sheet'}
      startsAtStep={pickedStep ?? startsAtStep}
      extra={
        <BillPaidFromNotice
          billId={billId}
          bill={bill}
          payment={payment}
          today={today}
          onPickAnother={() => setPickedStep('funding')}
        />
      }
      payment={payment}
      onClose={onClose}
    />
  );
}

export default BillRow;
