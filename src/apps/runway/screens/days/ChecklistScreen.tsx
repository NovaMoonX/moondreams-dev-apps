import { useState } from 'react';

import { Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ChecklistGroup from '@apps/runway/components/ChecklistGroup';
import ItemRow from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import {
  BILL_WORDS,
  CHECKLIST_WORDS,
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
import { describeBillProgress } from '@apps/runway/utils/billText';

interface ChecklistBillRowProps {
  line: RecordLine;
  payment: BillPayment | null;
  today: number;
  isDone: boolean;
  onDone: (isDone: boolean) => void;
}

/** A bill the day set money aside for: tapping it ticks it, and its chevron opens the bill, where it can be marked paid. */
function ChecklistBillRow({
  line,
  payment,
  today,
  isDone,
  onDone,
}: ChecklistBillRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const progress = payment
    ? (describeBillProgress(payment) ?? BILL_WORDS.readyToPay)
    : null;
  const amount = formatCents(line.cents);

  return (
    <>
      <ItemRow
        name={line.name}
        detail={progress}
        figure={amount}
        ariaLabel={`${line.name}, ${amount}`}
        tick={{ checked: isDone, onChange: onDone }}
        onOpen={payment ? () => setIsOpen(true) : undefined}
      />
      {isOpen && payment && (
        <ItemSheet
          itemId={line.itemId}
          kind='bill'
          today={today}
          figureLabel='From this day'
          figure={amount}
          facts={[`Due ${formatDateUTC(payment.dueOn)}`, progress]}
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

interface ChecklistScreenProps {
  day: ListedDay;
  lines: readonly RecordLine[];
}

/** What to do with the money of a confirmed day: the bills it set money aside for, ready to pay or still waiting for the rest. */
function ChecklistScreen({ day, lines }: ChecklistScreenProps) {
  const { user } = useAuth();
  const { isBelow } = useMediaQuery();
  const everythingLabel = isBelow('sm')
    ? CHECKLIST_WORDS.everythingShort
    : CHECKLIST_WORDS.everything;
  const { addToast } = useToast();
  const today = todayAsUtcDate(useNow(60_000));
  const items = useAppSelector((state) => state.runway.items);
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const openDay = useAppSelector((state) => selectOpenDay(state, day.dayKey));
  const doneIds = openDay?.doneLineIds ?? [];
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
  const doneCount = readyIds.filter((id) => done.has(id)).length;

  if (rows.length === 0) return null;

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
            onCheckedChange={(next) => setDone(readyIds, Boolean(next))}
            aria-label={CHECKLIST_WORDS.everything}
          />
          <span className='min-w-0 flex-1 font-medium'>{everythingLabel}</span>
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
                  (payment ? describeBillProgress(payment) : null) ??
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
