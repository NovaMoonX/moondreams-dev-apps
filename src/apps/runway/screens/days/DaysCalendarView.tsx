import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button, Calendar } from '@moondreamsdev/dreamer-ui/components';

import HeaderIconButton from '@/components/HeaderIconButton';
import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import BillRow, { BillSheet } from '@apps/runway/components/BillRow';
import CardRow from '@apps/runway/components/CardRow';
import CardSheets, {
  type OpenedCard,
} from '@apps/runway/components/CardSheets';
import GoalRow from '@apps/runway/components/GoalRow';
import IncomeDayCard from '@apps/runway/components/IncomeDayCard';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { DAYS_CALENDAR_WORDS, LOOKAHEAD_MONTHS } from '@apps/runway/constants';
import {
  addUtcMonths,
  DAY_MS,
  todayAsUtcDate,
} from '@apps/runway/engine/dates';
import { listPlanChangeDays } from '@apps/runway/engine/planChanges';
import PlanChangeRow from '@apps/runway/components/PlanChangeRow';
import PlanChangesDoor from '@apps/runway/screens/days/PlanChangesDoor';
import { findLinkHolder } from '@apps/runway/engine/horizonLinks';
import { listStartChanges } from '@apps/runway/utils/comingChangeText';
import { describePlanChangeGoes } from '@apps/runway/utils/planChangeText';
import {
  buildCalendarEntries,
  type CalendarEntry,
} from '@apps/runway/engine/dayCalendar';
import { effectiveStance, pick } from '@apps/runway/engine/stance';
import { useGoalPaces } from '@apps/runway/hooks/useGoalPaces';
import { Dot } from '@apps/runway/screens/days/CalendarDot';
import { getDotKind } from '@apps/runway/utils/calendarDots';
import DaysCalendarCell from '@apps/runway/screens/days/DaysCalendarCell';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectBillPayments,
  selectBills,
  selectCards,
  selectEffectiveSplit,
  selectHeldByItem,
  selectAllHorizonItems,
  selectListedDays,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { formatDayTitle } from '@apps/runway/utils/dayTitle';
import { isTrackingLevel } from '@apps/runway/engine/level';

const MAX_AGENDA_CHANGES = 3;

const CALENDAR_STYLES = {
  containerClassName: 'border-0 bg-transparent p-0 shadow-none',
  headerClassName: 'hidden',
  monthGridClassName: 'gap-0.5 max-[359px]:gap-0 max-[359px]:p-0',
  cellClassName:
    'group relative h-14 min-h-0 w-full rounded-lg border-0 p-0 bg-transparent hover:bg-muted focus:bg-transparent disabled:pointer-events-none disabled:opacity-100 disabled:hover:bg-transparent max-[359px]:border-2 max-[359px]:border-transparent max-[359px]:bg-clip-padding',
  selectedCellClassName: 'bg-transparent text-foreground',
  todayCellClassName: 'border-0',
};

const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const toIndex = (date: number) => {
  const value = new Date(date);
  return value.getUTCFullYear() * 12 + value.getUTCMonth();
};
const monthStartOf = (index: number) =>
  Date.UTC(Math.floor(index / 12), index % 12, 1);
const toUtcDay = (date: Date) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

const NO_ENTRIES: CalendarEntry[] = [];

interface DaysCalendarViewProps {
  today: number;
  getShorts: (dayKey: string) => { name: string; shortBy: number }[];
}

/** A month of what is coming: income days, bills, card due dates and goal dates, with the tapped day's rows under the grid. */
function DaysCalendarView({ today, getShorts }: DaysCalendarViewProps) {
  const { open, confirmed } = useAppSelector((state) =>
    selectListedDays(state, today),
  );
  const bills = useAppSelector((state) => selectBills(state, today));
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const cards = useAppSelector(selectCards);
  const isTracking = isTrackingLevel(useAppSelector(selectLevel));
  const reserveByCard = useAppSelector(selectBalances).reserveByCard;
  const stance = useAppSelector(selectStance);
  const heldByItem = useAppSelector(selectHeldByItem);
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? null,
  );
  const paces = useGoalPaces(today);
  const planItems = useAppSelector((state) => state.runway.items);
  const planVersions = useAppSelector((state) => state.runway.versions);
  const events = useAppSelector((state) => selectAllHorizonItems(state, today));
  const { openDay } = useRunwayUrlState();

  const thisIndex = toIndex(today);
  const lastIndex = toIndex(today) + LOOKAHEAD_MONTHS;
  const firstIndex = Math.min(
    thisIndex,
    toIndex(
      confirmed.reduce(
        (earliest, day) => Math.min(earliest, day.on),
        startDate ?? today,
      ),
    ),
  );
  const [monthIndex, setMonthIndexState] = useState(thisIndex);
  const [pickedOn, setPickedOn] = useState<number | null>(null);
  const [openBillRef, setOpenBillRef] = useState<{
    billId: string;
    on: number;
  } | null>(null);
  const setMonthIndex = (index: number) => {
    setPickedOn(null);
    setMonthIndexState(index);
  };
  const [openCard, setOpenCard] = useState<OpenedCard | null>(null);
  const agendaRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => [...open, ...confirmed], [open, confirmed]);
  const sources = useMemo(
    () => ({
      incomeDays: days,
      billPayments: Object.entries(payments).flatMap(([billId, list]) =>
        list.flatMap(({ dueOn, totalCents, paid }) =>
          paid !== null || dueOn >= (startDate ?? today)
            ? [{ billId, dueOn, totalCents }]
            : [],
        ),
      ),
      cards: isTracking
        ? cards.map((card) => ({
            cardId: card.id,
            dueDay: card.dueDay,
            since: Math.max(startDate ?? 0, todayAsUtcDate(card.createdAt)),
          }))
        : [],
      goals: paces.flatMap(({ item, pace, isSavingAhead, track }) =>
        pace.isComplete || !isSavingAhead
          ? []
          : [{ goalId: item.id, targetDate: pace.targetDate, track }],
      ),
      planChanges: [
        ...listPlanChangeDays(
          planVersions,
          planItems,
          today + DAY_MS,
          addUtcMonths(today, LOOKAHEAD_MONTHS + 1),
        ),
        ...listStartChanges(
          planVersions,
          planItems,
          today,
          (link) => findLinkHolder(events, link) !== null,
        ),
      ],
    }),
    [
      days,
      payments,
      cards,
      isTracking,
      paces,
      today,
      startDate,
      planVersions,
      planItems,
      events,
    ],
  );
  const monthStart = monthStartOf(monthIndex);
  const monthEnd = monthStartOf(monthIndex + 1) - DAY_MS;
  const byDay = useMemo(
    () => buildCalendarEntries(sources, monthStart, monthEnd),
    [sources, monthStart, monthEnd],
  );

  const getSelectedOn = () => {
    if (pickedOn !== null && pickedOn >= monthStart && pickedOn <= monthEnd) {
      return pickedOn;
    }
    if (monthIndex === thisIndex) {
      return (
        [...byDay.keys()].sort((a, b) => a - b).find((on) => on >= today) ??
        today
      );
    }
    return [...byDay.keys()].sort((a, b) => a - b)[0] ?? monthStart;
  };
  const selectedOn = getSelectedOn();
  const selectedEntries = byDay.get(selectedOn) ?? NO_ENTRIES;

  const monthEntries = [...byDay.values()].flat();
  const billsCents = monthEntries.reduce(
    (sum, entry) => sum + (entry.kind === 'bill' ? entry.totalCents : 0),
    0,
  );
  const incomeDayKeys = monthEntries.flatMap((entry) =>
    entry.kind === 'income' ? [entry.dayKey] : [],
  );
  const incomeCents = useAppSelector((state) =>
    days
      .filter((day) => incomeDayKeys.includes(day.dayKey))
      .reduce(
        (sum, day) =>
          sum +
          (selectEffectiveSplit(state, day.dayKey)?.arrivedCents ??
            pick(
              effectiveStance(stance, day.stanceOverride),
              day.amount,
              'income',
            )),
        0,
      ),
  );
  const monthLine =
    incomeDayKeys.length > 0 && billsCents > 0
      ? DAYS_CALENDAR_WORDS.monthTotals(
          formatCents(incomeCents),
          formatCents(billsCents),
        )
      : incomeDayKeys.length > 0
        ? DAYS_CALENDAR_WORDS.monthIncomeOnly(formatCents(incomeCents))
        : billsCents > 0
          ? DAYS_CALENDAR_WORDS.monthBillsOnly(formatCents(billsCents))
          : null;

  const dotKinds = new Set(monthEntries.map(getDotKind));
  const legend = (
    [
      ['income', DAYS_CALENDAR_WORDS.legend.income],
      ['bill', DAYS_CALENDAR_WORDS.legend.bill],
      ['card', DAYS_CALENDAR_WORDS.legend.card],
      ['goal', DAYS_CALENDAR_WORDS.legend.goal],
      ['goalBehind', DAYS_CALENDAR_WORDS.legend.goalBehind],
      ['change', DAYS_CALENDAR_WORDS.legend.planChange],
    ] as const
  ).filter(([kind]) => dotKinds.has(kind));

  const dayDays = new Map(days.map((day) => [day.dayKey, day]));
  const openBill = bills.find(({ item }) => item.id === openBillRef?.billId);
  const changeEntries = selectedEntries.filter(
    (entry): entry is Extract<CalendarEntry, { kind: 'change' }> =>
      entry.kind === 'change',
  );
  const otherEntries = selectedEntries.filter(
    (entry) => entry.kind !== 'change',
  );
  const getRow = (entry: CalendarEntry) => {
    if (entry.kind === 'income') {
      const day = dayDays.get(entry.dayKey);
      return day ? (
        <IncomeDayCard
          key={entry.dayKey}
          day={day}
          shorts={getShorts(day.dayKey)}
          onOpen={() => openDay(day.dayKey)}
        />
      ) : null;
    }
    if (entry.kind === 'bill') {
      const bill = bills.find(({ item }) => item.id === entry.billId);
      return bill ? (
        <BillRow
          key={`${entry.billId}${entry.on}`}
          bill={bill.version.payload}
          payment={
            (payments[entry.billId] ?? []).find(
              (payment) => payment.dueOn === entry.on,
            ) ?? null
          }
          planStance={stance}
          today={today}
          figureKind='payment'
          onOpen={() => setOpenBillRef({ billId: entry.billId, on: entry.on })}
        />
      ) : null;
    }
    if (entry.kind === 'card') {
      const card = cards.find(({ id }) => id === entry.cardId);
      return card ? (
        <CardRow
          key={entry.cardId}
          card={card}
          allCards={cards}
          reserveCents={reserveByCard[card.id] ?? 0}
          today={today}
          onOpen={() => setOpenCard({ cardId: card.id, view: 'menu' })}
        />
      ) : null;
    }
    if (entry.kind === 'change') {
      return (
        <PlanChangeRow
          key={`${entry.change.itemId}${entry.on}`}
          change={entry.change}
          today={today}
          text={describePlanChangeGoes(entry.change)}
        />
      );
    }
    const goal = paces.find(({ item }) => item.id === entry.goalId);
    return goal ? (
      <GoalRow
        key={entry.goalId}
        goalId={goal.item.id}
        goal={goal.payload}
        pace={goal.pace}
        paceDial={goal.paceDial}
        heldCents={heldByItem[goal.item.id] ?? 0}
        today={today}
        detailLead={DAYS_CALENDAR_WORDS.goalDate}
      />
    ) : null;
  };

  return (
    <div className='space-y-3'>
      <div className='flex min-h-10 items-center justify-between gap-2'>
        <h2 className='text-base font-semibold'>
          {monthFormat.format(monthStart)}
        </h2>
        <div className='flex items-center gap-3'>
          {monthIndex !== thisIndex && (
            <Button
              variant='tertiary'
              size='sm'
              className="relative after:absolute after:-inset-1.5 after:content-['']"
              onClick={() => setMonthIndex(thisIndex)}
            >
              {DAYS_CALENDAR_WORDS.today}
            </Button>
          )}
          <HeaderIconButton
            icon={<ChevronLeft className='h-4 w-4' />}
            label={DAYS_CALENDAR_WORDS.previousMonth}
            isDisabled={monthIndex <= firstIndex}
            onClick={() => setMonthIndex(monthIndex - 1)}
          />
          <HeaderIconButton
            icon={<ChevronRight className='h-4 w-4' />}
            label={DAYS_CALENDAR_WORDS.nextMonth}
            isDisabled={monthIndex >= lastIndex}
            onClick={() => setMonthIndex(monthIndex + 1)}
          />
        </div>
      </div>
      {legend.length > 0 && (
        <ul className='text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs'>
          {legend.map(([kind, label]) => (
            <li key={kind} className='flex items-center gap-1'>
              <Dot kind={kind} />
              {label}
            </li>
          ))}
        </ul>
      )}
      <Calendar
        key={monthIndex}
        mode='single'
        size='auto'
        className='mx-auto max-w-2xl'
        initialDate={new Date(Math.floor(monthIndex / 12), monthIndex % 12, 1)}
        showNavigation={false}
        minDate={new Date(Math.floor(monthIndex / 12), monthIndex % 12, 1)}
        maxDate={
          new Date(Math.floor(monthIndex / 12), (monthIndex % 12) + 1, 0)
        }
        onDateSelect={(date) => {
          const on = toUtcDay(date);
          if (on < monthStart || on > monthEnd) return;
          setPickedOn(on);
          requestAnimationFrame(() =>
            agendaRef.current?.scrollIntoView({
              block: 'nearest',
              behavior: 'smooth',
            }),
          );
        }}
        customStyles={CALENDAR_STYLES}
        renderCell={(date, _isSelected, _isDisabled, isToday) => {
          const on = toUtcDay(date);
          return (
            <DaysCalendarCell
              date={date}
              entries={byDay.get(on) ?? NO_ENTRIES}
              isSelected={on === selectedOn}
              isToday={isToday}
              isPast={on < today}
              isOutsideMonth={on < monthStart || on > monthEnd}
            />
          );
        }}
      />
      {monthLine && (
        <p className='text-muted-foreground text-sm'>
          <MaskedText>{monthLine}</MaskedText>
        </p>
      )}
      <div ref={agendaRef} className='scroll-mb-36 space-y-3'>
        <SectionDivider label={formatDayTitle(selectedOn)} />
        {selectedEntries.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {DAYS_CALENDAR_WORDS.nothingOnDay}
          </p>
        ) : (
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {otherEntries.map(getRow)}
            {changeEntries.length > MAX_AGENDA_CHANGES ? (
              <PlanChangesDoor
                changes={changeEntries.map((entry) => entry.change)}
                day={formatDayTitle(selectedOn)}
                today={today}
              />
            ) : (
              changeEntries.map(getRow)
            )}
          </ul>
        )}
      </div>
      <CardSheets cards={cards} open={openCard} onChange={setOpenCard} />
      {openBill && (
        <BillSheet
          key={openBill.item.id}
          billId={openBill.item.id}
          bill={openBill.version.payload}
          payment={
            (payments[openBill.item.id] ?? []).find(
              (payment) => payment.dueOn === openBillRef?.on,
            ) ?? null
          }
          planStance={stance}
          today={today}
          onClose={() => setOpenBillRef(null)}
        />
      )}
    </div>
  );
}

export default DaysCalendarView;
