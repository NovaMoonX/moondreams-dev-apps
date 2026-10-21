import { useState } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import TrendLineChart from '@/components/TrendLineChart';
import MoneyInput from '@/components/MoneyInput';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import Stepper from '@/components/Stepper';
import Subview from '@/components/Subview';
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
  getCalendarAddedBy,
  getCalendarPlan,
  getNetSeries,
  getPaceAddedBy,
  getPaceMax,
  getProjectionBase,
  parseTicketCents,
  projectCalendar,
  projectPace,
  projectStop,
  type PaceUnit,
  type ProjectionResult,
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

function pluralize(count: number, word: string) {
  const result = count === 1 ? `${count} ${word}` : `${count} ${word}s`;
  return result;
}

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

  const scenario: Scenario =
    pickedScenario ?? (calendar.movies > 0 ? 'planned' : 'none');
  const months =
    pickedMonths !== null && base.horizons.includes(pickedMonths)
      ? pickedMonths
      : base.horizons[0];
  const ticketCents =
    valueInput === null
      ? base.averageTicketCents
      : parseTicketCents(valueInput);
  const isPace = scenario === 'pace';

  const getResult = (): ProjectionResult => {
    if (scenario === 'none') return projectStop(base, membership);
    if (scenario === 'planned') return calendar;
    return projectPace(
      base,
      membership,
      todayDay,
      { unit, count: counts[unit] },
      months,
      ticketCents,
    );
  };
  const result = getResult();
  const getAddedBy = () => {
    if (scenario === 'none') return () => 0;
    if (scenario === 'planned') return getCalendarAddedBy(plan);
    return getPaceAddedBy(todayDay, { unit, count: counts[unit] }, ticketCents);
  };
  const series =
    result.netCents === null
      ? []
      : getNetSeries(base, membership, todayDay, result, getAddedBy());
  const breakEven = isPace ? getBreakEven(base, result, ticketCents) : null;
  const isBrokenEven = result.netCents !== null && result.netCents >= 0;
  const until = formatDateUTC(result.coveredUntil);

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
    return `You watch ${counts[unit]} a ${unit}, then cancel before the ${bill} bill.`;
  };

  const getEyebrow = () => {
    if (scenario === 'none') return 'Net savings with no more movies';
    if (scenario === 'planned') return 'Net savings with everything planned';
    return `Net savings at ${counts[unit]} a ${unit}`;
  };

  const getBreakEvenLine = () => {
    if (!isPace) return null;
    if (isBrokenEven || !breakEven || breakEven.perPeriod === null) return null;
    if (breakEven.perPeriod > getPaceMax(unit))
      return `Breaking even by then would take more than A-List's ${getPaceMax(unit)} a ${unit}.`;
    return `Breaking even takes about ${breakEven.perPeriod} a ${unit} (${pluralize(breakEven.movies, 'movie')} in all).`;
  };
  const breakEvenLine = getBreakEvenLine();

  const getChartDescription = () => {
    const end = series.at(-1);
    if (!end) return '';
    const stop =
      scenario === 'none'
        ? ''
        : ` With no more movies, ${formatCents(end.y2)}.`;
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
                step={1}
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
                readoutLabels={{ main: 'Net', secondary: 'No more' }}
                curve='linear'
                secondaryLabel={
                  scenario === 'none' ? undefined : 'No more movies'
                }
                referenceY={{ value: 0, label: 'Break even' }}
                formatX={(value) =>
                  new Date(value).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })
                }
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
                    No more movies
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
              options={base.horizons.map((value) => ({
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
