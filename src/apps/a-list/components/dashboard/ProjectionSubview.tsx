import { useState } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import TrendLineChart from '@/components/TrendLineChart';
import AppToggle from '@/components/AppToggle';
import MoneyInput from '@/components/MoneyInput';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import Stepper from '@/components/Stepper';
import Subview from '@/components/Subview';
import { getNiceMoneyAxis } from '@/utils/chartUtils';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { centsToInputValue, formatCents } from '@/utils/moneyUtils';
import { MIN_CONTRACT_MONTHS } from '@apps/a-list/constants';
import { selectViewingItems } from '@apps/a-list/store/selectors';
import type { MembershipProfile } from '@apps/a-list/types';
import { getCycleDate } from '@apps/a-list/utils/billing';
import { getDayKey } from '@apps/a-list/utils/dayKeys';
import {
  getBreakEven,
  getBreakEvenPoint,
  getCalendarAddedBy,
  getCalendarPlan,
  getNetSeries,
  getPaceAddedBy,
  getPlanEndDay,
  getPlannedThenPaceAddedBy,
  getPaceMax,
  getProjectionBase,
  parseTicketCents,
  projectCalendar,
  projectPace,
  projectPlannedThenPace,
  projectStop,
  type PaceUnit,
} from '@apps/a-list/utils/projection';

type Scenario = 'none' | 'planned' | 'pace';

const SCENARIO_OPTIONS: PillOption<Scenario>[] = [
  { value: 'none', label: 'None' },
  { value: 'planned', label: 'Everything planned' },
  { value: 'pace', label: 'A set pace' },
];

const UNIT_OPTIONS: PillOption<PaceUnit>[] = [
  { value: 'week', label: 'a week' },
  { value: 'month', label: 'a month' },
];

interface ProjectionSubviewProps {
  membership: MembershipProfile;
  onClose: () => void;
}

function LegendLine({
  strokeWidth,
  dash,
  cap = 'round',
  className,
}: {
  strokeWidth: number;
  dash?: string;
  cap?: 'butt' | 'round';
  className: string;
}) {
  return (
    <svg width='20' height='6' aria-hidden='true' className={className}>
      <line
        x1='2'
        y1='3'
        x2='18'
        y2='3'
        stroke='currentColor'
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        strokeLinecap={cap}
      />
    </svg>
  );
}

const formatShortDate = (value: number) =>
  new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

function pluralize(count: number, word: string) {
  const result = count === 1 ? `${count} ${word}` : `${count} ${word}s`;
  return result;
}

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 120;
/** A tap on the counter moves a month's pace by two so the line visibly moves. */
const PACE_STEP: Record<PaceUnit, number> = { week: 1, month: 2 };

const clampCount = (goal: number | null, fallback: number, max: number) =>
  Math.max(1, Math.min(goal ?? fallback, max));

/** A what-if for the membership: where net savings would land under a few simple plans. Nothing here is saved. */
function ProjectionSubview({ membership, onClose }: ProjectionSubviewProps) {
  const now = useNow();
  const viewings = useAppSelector(selectViewingItems);
  const todayDay = fromDateInputValue(getDayKey(now)) ?? 0;
  const base = getProjectionBase(viewings, membership, todayDay);
  const plan = getCalendarPlan(base, membership, viewings, now);
  const calendar = projectCalendar(base, membership, plan);

  const [pickedScenario, setScenario] = useState<Scenario | null>(null);
  const [counts, setCounts] = useState<Record<PaceUnit, number>>({
    week: clampCount(membership.weeklyGoal, 2, getPaceMax('week')),
    month: clampCount(membership.monthlyGoal, 8, getPaceMax('month')),
  });
  const [unit, setUnit] = useState<PaceUnit>('week');
  const [pickedMonths, setPickedMonths] = useState<number | null>(null);
  const [valueInput, setValueInput] = useState<string | null>(null);
  const [isAfterPlan, setIsAfterPlan] = useState(false);

  const scenario: Scenario =
    pickedScenario ?? (calendar.movies > 0 ? 'planned' : 'none');
  const isPace = scenario === 'pace';
  const includePlan = isPace && isAfterPlan && calendar.movies > 0;
  const horizons = includePlan
    ? [
        ...new Set(
          base.horizons.map((value) => Math.max(value, calendar.months)),
        ),
      ]
    : base.horizons;
  const months =
    pickedMonths !== null && horizons.includes(pickedMonths)
      ? pickedMonths
      : (horizons[includePlan ? 1 : 0] ?? horizons[0]);
  const ticketCents =
    valueInput === null
      ? base.averageTicketCents
      : parseTicketCents(valueInput);

  const getPaceOutcome = (count: number) => {
    const pace = { unit, count };
    const paceResult = includePlan
      ? projectPlannedThenPace(
          base,
          membership,
          todayDay,
          plan,
          pace,
          months,
          ticketCents,
        )
      : projectPace(base, membership, todayDay, pace, months, ticketCents);
    const addedBy = includePlan
      ? getPlannedThenPaceAddedBy(plan, todayDay, pace, ticketCents)
      : getPaceAddedBy(todayDay, pace, ticketCents);
    const paceSeries =
      paceResult.netCents === null
        ? []
        : getNetSeries(
            base,
            membership,
            todayDay,
            paceResult,
            addedBy,
            fromDay,
            includePlan ? getCalendarAddedBy(plan) : undefined,
          );
    return { result: paceResult, series: paceSeries };
  };

  const fromDay = Math.max(
    membership.startDate,
    todayDay - HISTORY_DAYS * DAY_MS,
  );
  const getOutcome = () => {
    if (scenario === 'none') {
      const stop = projectStop(base, membership);
      return {
        result: stop,
        series: getNetSeries(
          base,
          membership,
          todayDay,
          stop,
          () => 0,
          fromDay,
        ),
      };
    }
    if (scenario === 'planned')
      return {
        result: calendar,
        series: getNetSeries(
          base,
          membership,
          todayDay,
          calendar,
          getCalendarAddedBy(plan),
          fromDay,
        ),
      };
    return getPaceOutcome(counts[unit]);
  };
  const { result, series } = getOutcome();
  const isBrokenEven = result.netCents !== null && result.netCents >= 0;
  const until = formatDateUTC(result.coveredUntil);
  const breakEvenPoint = getBreakEvenPoint(series);
  const futureBreakEven =
    breakEvenPoint && breakEvenPoint.x > todayDay ? breakEvenPoint : null;
  const breakEven = isPace
    ? getBreakEven(
        base,
        result,
        ticketCents,
        includePlan ? (calendar.addedCents ?? 0) : 0,
      )
    : null;

  // A pace keeps the axis sized for the fastest pace, so a step on the counter moves the line instead of re-fitting the scale.
  const getAxis = () => {
    if (series.length === 0) return undefined;

    const fastest = isPace ? getPaceOutcome(getPaceMax(unit)).series : [];
    const values = [...series, ...fastest]
      .flatMap((point) => [point.y, point.y2])
      .filter((value): value is number => value !== null);
    return getNiceMoneyAxis(Math.min(0, ...values), Math.max(0, ...values));
  };
  const axis = getAxis();

  const getNextStepLine = () => {
    if (!isPace || ticketCents === null) return null;
    if (counts[unit] >= getPaceMax(unit))
      return `That's the most A-List covers a ${unit}.`;

    const step = PACE_STEP[unit];
    const next = getPaceOutcome(
      Math.min(counts[unit] + step, getPaceMax(unit)),
    );
    const gain = (next.result.netCents ?? 0) - (result.netCents ?? 0);
    if (gain <= 0) return null;

    const nextPoint = getBreakEvenPoint(next.series);
    const nextFuture = nextPoint && nextPoint.x > todayDay ? nextPoint : null;
    const days =
      futureBreakEven && nextFuture
        ? Math.round((futureBreakEven.x - nextFuture.x) / DAY_MS)
        : 0;
    const getTail = () => {
      if (days >= 1) return ` and breaks even ${pluralize(days, 'day')} sooner`;
      if (!futureBreakEven && !isBrokenEven && nextFuture)
        return ` and would break even around ${formatDateUTC(nextFuture.x)}`;
      return '';
    };
    return `${step === 1 ? 'One more' : 'Two more'} a ${unit} adds about ${formatCents(gain)} by ${until}${getTail()}.`;
  };
  const nextStepLine = getNextStepLine();

  const getContractLine = () => {
    if (base.minimumMonthsLeft === 0)
      return `You're past A-List's ${MIN_CONTRACT_MONTHS}-month minimum, so each month is your call.`;
    const left = formatCents(base.minimumMonthsLeft * base.monthlyTotalCents);
    return `A-List has a ${MIN_CONTRACT_MONTHS}-month minimum. ${pluralize(base.minimumMonthsLeft, 'month')} to go, so ${left} more is owed even if you stop.`;
  };

  const getPlanLine = () => {
    const bill = formatDateUTC(result.coveredUntil);
    if (scenario === 'none')
      return `You cancel now and pay only what the minimum requires. Your last paid bill ends ${bill}.`;
    if (scenario === 'planned')
      return `You watch all ${pluralize(calendar.movies, 'showing')} already on your calendar, then cancel before the ${bill} bill.`;
    if (includePlan)
      return `You watch all ${pluralize(calendar.movies, 'showing')} already on your calendar, then ${counts[unit]} a ${unit}, and cancel before the ${bill} bill.`;
    return `You watch ${counts[unit]} a ${unit}, then cancel before the ${bill} bill.`;
  };

  const getEyebrow = () => {
    if (scenario === 'none') return 'Net savings with no more movies';
    if (scenario === 'planned') return 'Net savings with everything planned';
    if (includePlan)
      return `Net savings after everything planned, then ${counts[unit]} a ${unit}`;
    return `Net savings at ${counts[unit]} a ${unit}`;
  };

  const getBreakEvenLine = () => {
    if (breakEvenPoint)
      return `${breakEvenPoint.x > todayDay ? "You'd break even" : 'You broke even'} around ${formatDateUTC(breakEvenPoint.x)}.`;
    if (!isPace || isBrokenEven || !breakEven || breakEven.perPeriod === null)
      return null;
    if (breakEven.perPeriod > getPaceMax(unit))
      return `Breaking even by then would take more than A-List's ${getPaceMax(unit)} a ${unit}.`;
    return `Breaking even takes about ${breakEven.perPeriod} a ${unit} (${pluralize(breakEven.movies, 'movie')} in all).`;
  };
  const breakEvenLine = getBreakEvenLine();

  const planEnd = getPlanEndDay(plan, todayDay);
  const hasPlanEndMark =
    includePlan && planEnd > todayDay && planEnd < result.coveredUntil;
  // The band's label needs about 40% of the chart's width, or it is clipped.
  const hasRoomForBandLabel =
    hasPlanEndMark &&
    series[0] !== undefined &&
    (result.coveredUntil - planEnd) / (result.coveredUntil - series[0].x) >=
      0.4;
  const comparisonLabel = includePlan ? 'Planned only' : 'No more movies';
  const lastPoint = series.at(-1);
  const afterPlanGain =
    hasPlanEndMark && lastPoint && lastPoint.y2 !== null
      ? lastPoint.y - lastPoint.y2
      : 0;
  const afterPlanLine =
    afterPlanGain > 0
      ? `Once everything planned ends ${formatShortDate(planEnd)}, ${counts[unit]} a ${unit} adds about ${formatCents(afterPlanGain)} by ${until}.`
      : null;

  const getChartDescription = () => {
    const end = series.at(-1);
    if (!end) return '';
    const stop =
      scenario === 'none' || end.y2 === null
        ? ''
        : ` ${includePlan ? 'With only what is planned' : 'With no more movies'}, ${formatCents(end.y2)}.`;
    return `Net savings reach ${formatCents(end.y)} by ${until}.${stop}`;
  };

  return (
    <Subview title='Projection' onClose={onClose}>
      <div className='space-y-4'>
        {base.minimumMonthsLeft > 0 && (
          <p className='bg-secondary/60 border-border rounded-2xl border px-4 py-3 text-sm'>
            <span aria-hidden='true'>🔒 </span>
            {getContractLine()}
          </p>
        )}
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs font-medium'>
            How many more movies will you watch?
          </p>
          <PillGroup
            label='How many more movies will you watch?'
            options={SCENARIO_OPTIONS.filter(
              (option) =>
                option.value !== 'planned' ||
                calendar.movies > 0 ||
                scenario === 'planned',
            )}
            value={scenario}
            onChange={setScenario}
            isThin
          />
          <p className='text-muted-foreground text-sm'>{getPlanLine()}</p>
        </div>
        {isPace && (
          <div className='space-y-1'>
            <p className='text-muted-foreground text-xs font-medium'>
              How often
            </p>
            <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
              <Stepper
                label={`Movies a ${unit}`}
                value={counts[unit]}
                min={1}
                max={getPaceMax(unit)}
                step={PACE_STEP[unit]}
                onChange={(count) =>
                  setCounts((current) => ({ ...current, [unit]: count }))
                }
              />
              <PillGroup
                label='Per'
                options={UNIT_OPTIONS}
                value={unit}
                onChange={setUnit}
                isThin
              />
            </div>
            {nextStepLine && (
              <p className='text-muted-foreground text-xs'>{nextStepLine}</p>
            )}
            {calendar.movies > 0 && (
              <div className='flex items-center justify-between gap-3 pt-1'>
                <p className='text-sm'>
                  Start after everything planned
                  <span className='text-muted-foreground block text-xs'>
                    Your {pluralize(calendar.movies, 'showing')} on the calendar
                    come first.
                  </span>
                </p>
                <AppToggle
                  aria-label='Start after everything planned'
                  checked={isAfterPlan}
                  onCheckedChange={setIsAfterPlan}
                />
              </div>
            )}
          </div>
        )}
        <div className='border-border bg-card rounded-3xl border p-4 shadow-sm'>
          <p className='text-muted-foreground flex items-center gap-2 text-sm font-medium'>
            <span
              className='bg-accent grid size-8 place-items-center rounded-full text-base'
              aria-hidden='true'
            >
              🔮
            </span>
            {getEyebrow()}
          </p>
          {result.netCents === null ? (
            <p className='mt-2 text-lg font-semibold'>
              Type what a movie saves you, below, to see this.
            </p>
          ) : (
            <>
              <p
                className={join(
                  'mt-2 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl',
                  isBrokenEven ? 'text-success' : 'text-foreground',
                )}
              >
                {formatCents(result.netCents)}
              </p>
              <p
                className={join(
                  'mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
                  isBrokenEven
                    ? 'bg-success/15 text-success'
                    : 'bg-accent text-accent-foreground',
                )}
              >
                <span aria-hidden='true'>{isBrokenEven ? '🎉' : '🎯'}</span>
                {isBrokenEven ? 'Ahead of break even' : 'Short of break even'}
              </p>
              <p className='text-muted-foreground mt-2 text-sm'>
                {formatCents(base.savedCents + (result.addedCents ?? 0))} in
                tickets, after {formatCents(result.costCents)} of membership,
                through {until}.
              </p>
            </>
          )}
          {breakEvenLine && (
            <p className='text-muted-foreground mt-1 text-sm'>
              {breakEvenLine}
            </p>
          )}
          {afterPlanLine && (
            <p className='text-muted-foreground mt-1 text-sm'>
              {afterPlanLine}
            </p>
          )}
          {scenario === 'planned' && result.unpricedCount > 0 && (
            <p className='text-muted-foreground mt-1 text-sm'>
              {pluralize(result.unpricedCount, 'showing')} with no price and no
              tickets on record yet count as $0.
            </p>
          )}
          {scenario === 'planned' && result.unmarkedCount > 0 && (
            <p className='text-muted-foreground mt-1 text-sm'>
              {pluralize(result.unmarkedCount, 'showing')} already over{' '}
              {result.unmarkedCount === 1 ? "isn't" : "aren't"} marked seen yet,
              so {result.unmarkedCount === 1 ? "it isn't" : "they aren't"}{' '}
              counted.
            </p>
          )}
          {series.length > 1 && (
            <div className='mt-3' role='img' aria-label={getChartDescription()}>
              <TrendLineChart
                data={series}
                seriesLabel='Net savings'
                readoutLabels={{
                  main: 'Net',
                  secondary: includePlan ? 'Planned' : 'No more',
                }}
                curve='linear'
                secondaryLabel={
                  scenario === 'none' ? undefined : comparisonLabel
                }
                referenceY={{ value: 0, label: 'Break even' }}
                yDomain={axis?.domain}
                yTicks={axis?.ticks}
                dividers={[
                  ...(series[0] && series[0].x < todayDay
                    ? [{ x: todayDay, label: 'Today' }]
                    : []),
                  ...(hasPlanEndMark
                    ? [
                        {
                          x: planEnd,
                          label: '',
                        },
                      ]
                    : []),
                ]}
                band={
                  hasPlanEndMark
                    ? {
                        x1: planEnd,
                        x2: result.coveredUntil,
                        label: hasRoomForBandLabel
                          ? `After ${formatShortDate(planEnd)} · ${counts[unit]} a ${unit}`
                          : '',
                      }
                    : undefined
                }
                marker={
                  breakEvenPoint
                    ? {
                        x: breakEvenPoint.x,
                        y: 0,
                        label: `${breakEvenPoint.x > todayDay ? 'Break even' : 'Broke even'} ${formatShortDate(breakEvenPoint.x)}`,
                      }
                    : undefined
                }
                formatX={formatShortDate}
                formatValue={formatCents}
                formatY={(value) =>
                  formatCents(Math.round(value / 100) * 100).replace('.00', '')
                }
                hasDots={false}
                isSoft
                className='h-40 sm:h-56 [@media(max-height:500px)]:h-32'
              />
              <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs'>
                <span className='flex items-center gap-1.5'>
                  <LegendLine strokeWidth={3} className='text-primary' />
                  Net savings
                </span>
                <span className='flex items-center gap-1.5'>
                  <LegendLine
                    strokeWidth={1}
                    className='text-muted-foreground/70'
                  />
                  Break even ($0)
                </span>
                {scenario !== 'none' && (
                  <span className='flex items-center gap-1.5'>
                    <LegendLine
                      strokeWidth={3}
                      dash='0.1 7'
                      className='text-foreground/85'
                    />
                    {comparisonLabel}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        {isPace && (
          <div className='space-y-3'>
            <p className='text-muted-foreground text-xs font-medium'>
              Cancel before the bill on
            </p>
            <PillGroup
              label='Cancel before the bill on'
              options={horizons.map((value) => ({
                value: String(value),
                label: formatDateUTC(getCycleDate(membership.startDate, value)),
              }))}
              value={String(months)}
              onChange={(value) => setPickedMonths(Number(value))}
              isThin
            />
            <div className='space-y-1'>
              <p className='text-muted-foreground text-xs font-medium'>
                Each movie saves you
              </p>
              <MoneyInput
                ariaLabel='What each movie saves you'
                value={valueInput ?? centsToInputValue(base.averageTicketCents)}
                onChange={setValueInput}
                placeholder='0.00'
              />
              <p className='text-muted-foreground text-xs'>
                {base.averageTicketCents === null
                  ? 'No tickets on record yet. Type what a ticket usually costs you, fees and tax included.'
                  : 'Your average so far, with fees and tax. Change it to try another.'}
              </p>
            </div>
          </div>
        )}
        <p className='text-muted-foreground text-center text-xs'>
          Just an estimate. Nothing here is saved.
        </p>
      </div>
    </Subview>
  );
}

export default ProjectionSubview;
