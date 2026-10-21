import { useState } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import MoneyInput from '@/components/MoneyInput';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import Stepper from '@/components/Stepper';
import Subview from '@/components/Subview';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import { MIN_CONTRACT_MONTHS } from '@apps/a-list/constants';
import { selectViewingItems } from '@apps/a-list/store/selectors';
import type { MembershipProfile } from '@apps/a-list/types';
import { getDayKey } from '@apps/a-list/utils/dayKeys';
import {
  getMoviesToBreakEven,
  getPaceMax,
  getProjectionBase,
  projectCalendar,
  projectPace,
  projectStop,
  type PaceUnit,
  type ProjectionResult,
} from '@apps/a-list/utils/projection';

type Scenario = 'stop' | 'calendar' | 'week' | 'month';

const SCENARIO_OPTIONS: PillOption<Scenario>[] = [
  { value: 'stop', emoji: '🛑', label: 'Stop now' },
  { value: 'calendar', emoji: '📅', label: 'My calendar' },
  { value: 'week', emoji: '🗓️', label: 'Per week' },
  { value: 'month', emoji: '🍿', label: 'Per month' },
];

interface ProjectionSubviewProps {
  membership: MembershipProfile;
  onClose: () => void;
}

function pluralize(count: number, word: string) {
  const result = count === 1 ? `${count} ${word}` : `${count} ${word}s`;
  return result;
}

/** A what-if for the membership: where net savings would land under a few simple plans. Nothing here is saved. */
function ProjectionSubview({ membership, onClose }: ProjectionSubviewProps) {
  const now = useNow();
  const viewings = useAppSelector(selectViewingItems);
  const todayDay = fromDateInputValue(getDayKey(now)) ?? 0;
  const base = getProjectionBase(viewings, membership, todayDay);
  const calendar = projectCalendar(base, membership, viewings, now);

  const [pickedScenario, setScenario] = useState<Scenario | null>(null);
  const [counts, setCounts] = useState<Record<PaceUnit, number>>({
    week: Math.min(membership.weeklyGoal ?? 2, getPaceMax('week')),
    month: Math.min(membership.monthlyGoal ?? 8, getPaceMax('month')),
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
      : parseMoneyToCents(valueInput);
  const isPace = scenario === 'week' || scenario === 'month';

  const getResult = (): ProjectionResult => {
    if (scenario === 'stop') return projectStop(base, membership);
    if (scenario === 'calendar') return calendar;
    const unit = scenario;
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
  const netNowCents =
    base.savedCents - base.monthlyTotalCents * base.cyclesBilled;
  const toBreakEven = isPace
    ? getMoviesToBreakEven(base, result.costCents, ticketCents)
    : null;
  const isBrokenEven = result.netCents !== null && result.netCents >= 0;

  const getContractLine = () => {
    if (base.minimumMonthsLeft === 0)
      return `You're past A-List's ${MIN_CONTRACT_MONTHS}-month minimum, so each month is your call.`;
    const left = formatCents(base.minimumMonthsLeft * base.monthlyTotalCents);
    return `A-List has a ${MIN_CONTRACT_MONTHS}-month minimum. ${pluralize(base.minimumMonthsLeft, 'month')} to go, so ${left} more is owed even if you stop.`;
  };

  const getSummaryLine = () => {
    if (scenario === 'stop')
      return `Last bill ${formatDateUTC(result.lastBillDate)}`;
    if (scenario === 'calendar') {
      if (result.movies === 0)
        return 'Nothing is planned ahead on your calendar yet.';
      return `${pluralize(result.movies, 'showing')} ahead, paid up to ${formatDateUTC(result.lastBillDate)}`;
    }
    return `${pluralize(result.movies, 'movie')} by ${formatDateUTC(result.lastBillDate)}, ${pluralize(result.months, 'month')} billed`;
  };

  return (
    <Subview title='Projection' onClose={onClose}>
      <div className='space-y-4'>
        <p className='bg-secondary/60 rounded-2xl px-4 py-3 text-sm'>
          <span aria-hidden='true'>🔒 </span>
          {getContractLine()}
        </p>
        <PillGroup
          label='What if you'
          options={SCENARIO_OPTIONS}
          value={scenario}
          onChange={setScenario}
          isThin
        />
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
              label='Keep going for'
              options={base.horizons.map((value) => ({
                value: String(value),
                label: `${value} months`,
              }))}
              value={String(months)}
              onChange={(value) => setPickedMonths(Number(value))}
              isThin
            />
            <div className='space-y-1'>
              <p className='text-sm font-medium'>Each movie saves you</p>
              <MoneyInput
                ariaLabel='What each movie saves you'
                value={valueInput ?? centsToInputValue(base.averageTicketCents)}
                onChange={setValueInput}
                placeholder='0.00'
              />
              <p className='text-muted-foreground text-xs'>
                {base.averageTicketCents === null
                  ? 'No tickets on record yet, so type what a ticket usually costs.'
                  : 'Your average so far, with fees and tax. Change it to try another.'}
              </p>
            </div>
          </div>
        )}
        <div className='border-border bg-card rounded-3xl border p-5 shadow-sm'>
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
                  'mt-2 text-5xl font-bold tracking-tight tabular-nums',
                  isBrokenEven ? 'text-success' : 'text-foreground',
                )}
              >
                {formatCents(result.netCents)}
              </p>
              <p className='text-muted-foreground mt-2 text-sm'>
                {formatCents(base.savedCents + (result.addedCents ?? 0))} in
                tickets, after {formatCents(result.costCents)} of membership
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
                  ? 'Broken even'
                  : `${formatCents(-result.netCents)} short of break even`}
              </p>
            </>
          )}
          <p className='text-muted-foreground mt-3 text-sm'>
            {getSummaryLine()}
          </p>
          {toBreakEven !== null && toBreakEven > 0 && (
            <p className='text-muted-foreground mt-1 text-sm'>
              Breaking even takes {pluralize(toBreakEven, 'movie')} by then
              {result.movies < toBreakEven
                ? '.'
                : ', and this pace gets there.'}
            </p>
          )}
          {scenario === 'calendar' && result.unpricedCount > 0 && (
            <p className='text-muted-foreground mt-1 text-sm'>
              {pluralize(result.unpricedCount, 'showing')} with no price count
              as $0.
            </p>
          )}
          <p className='text-muted-foreground mt-1 text-sm'>
            Today it's {formatCents(netNowCents)}.
          </p>
        </div>
        <p className='text-muted-foreground text-center text-xs'>
          Just an estimate. Nothing here is saved.
        </p>
      </div>
    </Subview>
  );
}

export default ProjectionSubview;
