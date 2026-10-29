import { useEffect, useRef, useState } from 'react';

import { Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import SectionDivider from '@/components/SectionDivider';
import TickMark from '@/components/TickMark';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { store, useAppSelector } from '@/store';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import ChecklistGroup from '@apps/runway/components/ChecklistGroup';
import ItemRow from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import {
  BILL_WORDS,
  CHECKLIST_R3_WORDS,
  CHECKLIST_WORDS,
  ITEM_SHEET_R2_WORDS,
  TICK_HIT_CLASS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { countMarks } from '@apps/runway/engine/progress';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  markBillsPaid,
  PartlyMarkedError,
  setLinesDone,
  undoBillsPaid,
} from '@apps/runway/store/actions/moveActions';
import {
  selectBillPayments,
  selectOpenDay,
  type ListedDay,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { BillPayment } from '@apps/runway/engine/demands';
import type { RecordLine } from '@apps/runway/types';
import { useBillPaid } from '@apps/runway/hooks/useBillPaid';
import { getBillCardId } from '@apps/runway/utils/cardText';

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
  const [pending, setPending] = useState<boolean | null>(null);
  const progress = payment
    ? (getChecklistProgress(payment) ?? BILL_WORDS.readyToPay)
    : null;
  const amount = formatCents(line.cents);
  const settled = payment ? paid.isPaid : isDone;
  const isChecked = pending ?? settled;

  const toggle = async (next: boolean) => {
    if (!payment) {
      onDone(next);
      return;
    }
    if (!paid.isReady || paid.isBusy || next === paid.isPaid) return;
    setPending(next);
    const isWritten = next ? await paid.mark() : await paid.undo();
    setPending(null);
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

const isOffline = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

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
  const isMarkingRef = useRef(false);
  const [markTries, setMarkTries] = useState(0);
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
  const isSettled = (row: (typeof ready)[number]) =>
    row.payment ? row.payment.paid !== null : done.has(row.line.lineId);
  const doneCount = ready.filter(isSettled).length;
  const isAllSettled = doneCount === ready.length;

  if (rows.length === 0) return null;

  const markAll = async () => {
    if (!user || isMarkingRef.current) return;
    if (!navigator.onLine) {
      setMarkTries((count) => count + 1);
      addToast({
        title: CHECKLIST_R3_WORDS.markAllFailed,
        description: CHECKLIST_R3_WORDS.needsConnection,
        type: 'error',
      });
      return;
    }
    const unpaid = ready.flatMap((row) =>
      row.payment !== null && row.payment.paid === null
        ? [{ billId: row.line.itemId, payment: row.payment }]
        : [],
    );
    const lineIds = ready
      .filter((row) => !done.has(row.line.lineId))
      .map((row) => row.line.lineId);
    const dayLines = { dayId: day.dayKey, lineIds };
    isMarkingRef.current = true;
    setIsMarkingAll(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const written = await markBillsPaid(
        user.uid,
        encryption,
        unpaid.map(({ billId, payment }) => ({
          billId,
          cardId: getBillCardId(
            store.getState().runway.versions,
            billId,
            payment.dueOn,
          ),
          dueOn: payment.dueOn,
          amountCents: payment.totalCents,
          fundedCents: payment.heldNowCents,
          paidOn: todayAsUtcDate(),
          marks: countMarks(moves, billId, payment.dueOn),
        })),
        dayLines,
      );
      addToast({
        title:
          written.length === 0 && unpaid.length > 0
            ? CHECKLIST_R3_WORDS.nothingToMark
            : CHECKLIST_R3_WORDS.markedAllPaid(written.length),
        type: 'success',
        action:
          written.length === 0 && lineIds.length === 0
            ? undefined
            : {
                label: ITEM_SHEET_R2_WORDS.undo,
                onClick: () => void undoAll(written, dayLines),
              },
      });
    } catch (markError) {
      if (markError instanceof PartlyMarkedError) {
        const marked = markError.written;
        addToast({
          title: CHECKLIST_R3_WORDS.partlyMarked(marked.length, unpaid.length),
          description: isOffline(markError.cause)
            ? CHECKLIST_R3_WORDS.restNeedsConnection
            : CHECKLIST_R3_WORDS.restNotSaved,
          type: 'error',
          action: {
            label: ITEM_SHEET_R2_WORDS.undo,
            onClick: () => void undoAll(marked, dayLines),
          },
        });
        return;
      }
      addToast({
        title: CHECKLIST_R3_WORDS.markAllFailed,
        description: isOffline(markError)
          ? CHECKLIST_R3_WORDS.needsConnection
          : 'Nothing was changed.',
        type: 'error',
      });
    } finally {
      isMarkingRef.current = false;
      setIsMarkingAll(false);
      setMarkTries((count) => count + 1);
    }
  };

  const undoAll = async (
    written: Awaited<ReturnType<typeof markBillsPaid>>,
    dayLines: { dayId: string; lineIds: readonly string[] },
  ) => {
    if (!user) return;
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const count = await undoBillsPaid(
        user.uid,
        encryption,
        written,
        dayLines,
      );
      addToast({
        title: CHECKLIST_R3_WORDS.undoneAll(count),
        type: 'success',
      });
    } catch (undoError) {
      addToast({
        title: 'Those bills are still marked paid',
        description: isOffline(undoError)
          ? CHECKLIST_R3_WORDS.needsConnection
          : 'Nothing was changed.',
        type: 'error',
      });
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
          {isAllSettled ? (
            <span className='flex w-5 shrink-0 justify-center text-lg'>
              <TickMark />
            </span>
          ) : (
            <Checkbox
              key={markTries}
              className={TICK_HIT_CLASS}
              checked={isMarkingAll}
              indeterminate={!isMarkingAll && doneCount > 0}
              disabled={isMarkingAll}
              onCheckedChange={(next) => {
                if (next) void markAll();
              }}
              aria-label={ITEM_SHEET_R2_WORDS.everythingPaid}
            />
          )}
          <span className='min-w-0 flex-1 font-medium'>
            {isAllSettled
              ? CHECKLIST_R3_WORDS.allPaid
              : ITEM_SHEET_R2_WORDS.everythingPaid}
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
