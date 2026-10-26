import { useEffect, useRef, useState } from 'react';

import { Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import ChecklistGroup from '@apps/runway/components/ChecklistGroup';
import ItemRow from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import {
  BILL_WORDS,
  CHECKLIST_WORDS,
  ITEM_SHEET_R2_WORDS,
  TICK_HIT_CLASS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { setLinesDone } from '@apps/runway/store/actions/moveActions';
import {
  selectBillPayments,
  selectOpenDay,
  type ListedDay,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { BillPayment } from '@apps/runway/engine/demands';
import type { RecordLine } from '@apps/runway/types';
import {
  markPaymentPaid,
  undoPaymentPaid,
  useBillPaid,
} from '@apps/runway/hooks/useBillPaid';

interface ChecklistBillRowProps {
  line: RecordLine;
  payment: BillPayment | null;
  today: number;
  isDone: boolean;
  onDone: (isDone: boolean) => void;
}

/** A bill the day set money aside for: tapping it records it paid (an Undo toast takes it back), and its chevron opens the bill. */
function ChecklistBillRow({
  line,
  payment,
  today,
  isDone,
  onDone,
}: ChecklistBillRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { addToast } = useToast();
  const paid = useBillPaid({
    billId: line.itemId,
    billName: line.name,
    payment,
    onMarked: () => onDone(true),
    onUndone: () => onDone(false),
    isQuick: true,
  });
  const latest = useRef(paid);
  useEffect(() => {
    latest.current = paid;
  });
  const progress = payment
    ? (getChecklistProgress(payment) ?? BILL_WORDS.readyToPay)
    : null;
  const amount = formatCents(line.cents);
  const isChecked = payment ? paid.isPaid : isDone;

  const toggle = async (next: boolean) => {
    if (!payment) {
      onDone(next);
      return;
    }
    if (!paid.isReady || paid.isBusy || next === paid.isPaid) return;
    const isWritten = next ? await paid.mark() : await paid.undo();
    if (!isWritten) return;
    addToast({
      title: next
        ? ITEM_SHEET_R2_WORDS.markedPaid(line.name)
        : ITEM_SHEET_R2_WORDS.unmarkedPaid(line.name),
      type: 'success',
      action: {
        label: ITEM_SHEET_R2_WORDS.undo,
        onClick: () =>
          void (next ? latest.current.undo() : latest.current.mark()),
      },
    });
  };

  return (
    <>
      <ItemRow
        name={line.name}
        detail={progress}
        figure={amount}
        ariaLabel={`${line.name}, ${amount}`}
        tick={{ checked: isChecked, onChange: (next) => void toggle(next) }}
        onOpen={payment ? () => setIsOpen(true) : undefined}
      />
      {isOpen && payment && (
        <ItemSheet
          itemId={line.itemId}
          kind='bill'
          today={today}
          figureLabel='From this day'
          figure={amount}
          fact={[`Due ${formatDateShortUTC(payment.dueOn)}`, progress]
            .filter(Boolean)
            .join(' · ')}
          payment={payment}
          canChange={false}
          onMarked={() => onDone(true)}
          onUndone={() => onDone(false)}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

/** Where a payment stands, short enough for one line. */
const getChecklistProgress = (payment: BillPayment) => {
  const { paid, fundedCents, totalCents } = payment;
  if (paid) {
    return `${paid.paidOn < payment.dueOn ? 'Paid ahead' : 'Paid'} ${formatDateShortUTC(paid.paidOn)}`;
  }
  if (fundedCents <= 0) return null;
  if (fundedCents >= totalCents) return BILL_WORDS.readyToPay;
  return `${formatCentsShort(fundedCents)} of ${formatCentsShort(totalCents)} set aside`;
};

interface ChecklistScreenProps {
  day: ListedDay;
  lines: readonly RecordLine[];
}

/** What to do with the money of a confirmed day: the bills it set money aside for, ready to pay or still waiting for the rest. */
function ChecklistScreen({ day, lines }: ChecklistScreenProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const today = todayAsUtcDate(useNow(60_000));
  const items = useAppSelector((state) => state.runway.items);
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const openDay = useAppSelector((state) => selectOpenDay(state, day.dayKey));
  const doneIds = openDay?.doneLineIds ?? [];
  const moves = useAppSelector((state) => state.runway.moves);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const done = new Set(doneIds);

  const billIds = new Set(
    items.filter((item) => item.kind === 'bill').map((item) => item.id),
  );
  const rows = lines
    .filter((line) => billIds.has(line.itemId) && line.cents > 0)
    .map((line) => {
      const payment =
        (payments[line.itemId] ?? []).find((entry) => entry.dueOn >= day.on) ??
        null;
      const isWaiting =
        payment !== null &&
        payment.paid === null &&
        payment.fundedCents < payment.totalCents;
      return { line, payment, isWaiting };
    });
  const ready = rows.filter((row) => !row.isWaiting);
  const waiting = rows.filter((row) => row.isWaiting);
  const readyIds = ready.map((row) => row.line.lineId);
  const isSettled = (row: (typeof ready)[number]) =>
    row.payment ? row.payment.paid !== null : done.has(row.line.lineId);
  const doneCount = ready.filter(isSettled).length;

  if (rows.length === 0) return null;

  const markAll = async (isPaid: boolean) => {
    if (!user || isMarkingAll) return;
    const changing = ready.filter(
      (row) => row.payment !== null && (row.payment.paid !== null) !== isPaid,
    );
    setIsMarkingAll(true);
    try {
      await changing.reduce(async (previous, row) => {
        await previous;
        if (!row.payment) return;
        if (isPaid) {
          await markPaymentPaid(user.uid, row.line.itemId, row.payment, moves);
          return;
        }
        if (row.payment.paid)
          await undoPaymentPaid(user.uid, row.line.itemId, row.payment.paid);
      }, Promise.resolve());
      await setLinesDone(user.uid, day.dayKey, readyIds, isPaid, doneIds);
    } catch {
      addToast({ title: CHECKLIST_WORDS.tickFailed, type: 'error' });
    } finally {
      setIsMarkingAll(false);
    }
  };

  const setDone = async (lineIds: readonly string[], isDone: boolean) => {
    if (!user) return;
    try {
      await setLinesDone(user.uid, day.dayKey, lineIds, isDone, doneIds);
    } catch {
      addToast({ title: CHECKLIST_WORDS.tickFailed, type: 'error' });
    }
  };

  return (
    <section aria-label={CHECKLIST_WORDS.title} className='space-y-3'>
      {ready.length > 0 && (
        <div className='border-border bg-card flex min-h-12 items-center gap-3 rounded-2xl border px-3'>
          <Checkbox
            className={TICK_HIT_CLASS}
            checked={doneCount === ready.length}
            indeterminate={doneCount > 0 && doneCount < ready.length}
            disabled={isMarkingAll}
            onCheckedChange={(next) => void markAll(Boolean(next))}
            aria-label={ITEM_SHEET_R2_WORDS.everythingPaid}
          />
          <span className='min-w-0 flex-1 font-medium'>
            {ITEM_SHEET_R2_WORDS.everythingPaid}
          </span>
          <span className='text-muted-foreground text-sm whitespace-nowrap tabular-nums'>
            {doneCount} of {ready.length}
          </span>
        </div>
      )}
      {ready.length > 0 && (
        <ChecklistGroup
          label={CHECKLIST_WORDS.billsGroup}
          doneCount={doneCount}
          total={ready.length}
        >
          {ready.map(({ line, payment }) => (
            <ChecklistBillRow
              key={line.lineId}
              line={line}
              payment={payment}
              today={today}
              isDone={done.has(line.lineId)}
              onDone={(isDone) => setDone([line.lineId], isDone)}
            />
          ))}
        </ChecklistGroup>
      )}
      {waiting.length > 0 && (
        <div className='space-y-2'>
          <SectionDivider label={CHECKLIST_WORDS.waitingGroup} />
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {waiting.map(({ line, payment }) => (
              <ItemRow
                key={line.lineId}
                name={line.name}
                emoji={line.emoji}
                detail={
                  (payment ? getChecklistProgress(payment) : null) ??
                  BILL_WORDS.waiting
                }
                figure={formatCents(line.cents)}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default ChecklistScreen;
