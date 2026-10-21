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

type Scenario = 'stop' | 'calendar' | 'week' | 'month';

const SCENARIO_OPTIONS: PillOption<Scenario>[] = [
  { value: 'stop', label: 'Stop now' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

interface ProjectionSubviewProps {
  membership: MembershipProfile;
  onClose: () => void;
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
  const [pickedMonths, setPickedMonths] = useState<number | null>(null);
  const [valueInput, setValueInput] = useState<string | null>(null);

  const scenario: Scenario =
    pickedScenario ?? (calendar.movies > 0 ? 'calendar' : 'stop');
  const months =
    pickedMonths !== null && base.horizons.includes(pickedMonths)
      ? pickedMonths
      : base.horizons[0];
  const ticketCents =
    valueInput === null
      ? base.averageTicketCents
      : parseTicketCents(valueInput);
  const isPace = scenario === 'week' || scenario === 'month';

  const getResult = (): ProjectionResult => {
    if (scenario === 'stop') return projectStop(base, membership);
    if (scenario === 'calendar') return calendar;
    return projectPace(
      base,
      membership,
      todayDay,
      { unit: scenario, count: counts[scenario] },
      months,
      ticketCents,
    );
  };
  const result = getResult();
  const getAddedBy = () => {
    if (scenario === 'stop') return () => 0;
    if (scenario === 'calendar') return getCalendarAddedBy(plan);
    return getPaceAddedBy(
      todayDay,
      { unit: scenario, count: counts[scenario] },
      ticketCents,
    );
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

  const getAssumptionLine = () => {
    if (scenario !== 'calendar') return null;
    if (result.movies === 0)
      return 'Nothing is planned ahead on your calendar yet.';
    return `${pluralize(result.movies, 'showing')} ahead, assuming you watch them all.`;
  };

  const getBreakEvenLine = () => {
    if (scenario !== 'week' && scenario !== 'month') return null;
    if (isBrokenEven || !breakEven || breakEven.perPeriod === null) return null;
    const unit = scenario;
    if (breakEven.perPeriod > getPaceMax(unit))
      return `Breaking even by then would take more than A-List's ${getPaceMax(unit)} a ${unit}.`;
    return `Breaking even takes about ${breakEven.perPeriod} a ${unit} (${pluralize(breakEven.movies, 'movie')} in all).`;
  };
  const breakEvenLine = getBreakEvenLine();

  const getChartDescription = () => {
    const end = series.at(-1);
    if (!end) return '';
    const stop =
      scenario === 'stop' ? '' : ` If you stop now, ${formatCents(end.y2)}.`;
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
        <PillGroup
          label='What if'
          options={SCENARIO_OPTIONS}
          value={scenario}
          onChange={setScenario}
          isThin
        />
        <div className='border-border bg-card rounded-3xl border p-4 shadow-sm'>
          <p className='text-muted-foreground flex items-center gap-2 text-sm font-medium'>
            <span
              className='bg-accent grid size-8 place-items-center rounded-full text-base'
              aria-hidden='true'
            >
              🔮
            </span>
            Projected net savings
          </p>
          {result.netCents === null ? (
            <p className='mt-2 text-lg font-semibold'>
              Add what a movie saves you to see this.
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
                {isBrokenEven
                  ? 'Would break even'
                  : `${formatCents(-result.netCents)} short of break even`}
              </p>
              <p className='text-muted-foreground mt-2 text-sm'>
                {formatCents(base.savedCents + (result.addedCents ?? 0))} in
                tickets, after {formatCents(result.costCents)} of membership,
                through {until}.
              </p>
            </>
          )}
          {getAssumptionLine() && (
            <p className='text-muted-foreground mt-1 text-sm'>
              {getAssumptionLine()}
            </p>
          )}
          {breakEvenLine && (
            <p className='text-muted-foreground mt-1 text-sm'>
              {breakEvenLine}
            </p>
          )}
          {scenario === 'calendar' && result.unpricedCount > 0 && (
            <p className='text-muted-foreground mt-1 text-sm'>
              {pluralize(result.unpricedCount, 'showing')} with no price and no
              tickets on record yet count as $0.
            </p>
          )}
          {scenario === 'calendar' && result.unmarkedCount > 0 && (
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
                curve='linear'
                secondaryLabel={
                  scenario === 'stop' ? undefined : 'If you stop now'
                }
                referenceY={{ value: 0, label: 'Break even' }}
                formatX={(value) =>
                  new Date(value).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })
                }
                formatY={(value) =>
                  formatCents(Math.round(value / 100) * 100).replace('.00', '')
                }
                hasDots={false}
                isSoft
                className='h-40 sm:h-56 [@media(max-height:500px)]:h-32'
              />
              <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs'>
                <span className='flex items-center gap-1.5'>
                  <span
                    className='bg-primary h-1 w-4 rounded-full'
                    aria-hidden='true'
                  />
                  Net savings
                </span>
                <span className='flex items-center gap-1.5'>
                  <span
                    className='border-muted-foreground/50 h-0 w-4 border-t border-dashed'
                    aria-hidden='true'
                  />
                  Break even
                </span>
                {scenario !== 'stop' && (
                  <span className='flex items-center gap-1.5'>
                    <span
                      className='border-muted-foreground/60 h-0 w-4 border-t-2 border-dotted'
                      aria-hidden='true'
                    />
                    If you stop now
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        {isPace && (
          <div className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <p className='text-sm font-medium'>Movies a {scenario}</p>
              <Stepper
                label={`Movies a ${scenario}`}
                value={counts[scenario]}
                min={1}
                max={getPaceMax(scenario)}
                step={1}
                onChange={(count) =>
                  setCounts((current) => ({ ...current, [scenario]: count }))
                }
              />
            </div>
            <PillGroup
              label='Keep going until'
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
