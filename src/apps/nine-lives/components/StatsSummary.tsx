import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { shallowEqual } from 'react-redux';

import { useAppSelector } from '@/store';

import {
  makeSelectExpenseTotalsByHousehold,
  selectLitterBoxesByHousehold,
  selectLitterEntriesByHousehold,
  selectVisitsByHousehold,
} from '../store/selectors';
import StatTile from './StatTile';

interface StatsSummaryProps {
  householdId: string;
}

type RecurringView = 'monthly' | 'yearly';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function getDaysSince(timestamp: number) {
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function StatsSummary({ householdId }: StatsSummaryProps) {
  const [recurringView, setRecurringView] = useState<RecurringView>('monthly');

  const visits = useAppSelector(selectVisitsByHousehold(householdId), shallowEqual);
  const litterBoxes = useAppSelector(selectLitterBoxesByHousehold(householdId), shallowEqual);
  const litterEntries = useAppSelector(selectLitterEntriesByHousehold(householdId), shallowEqual);
  const selectExpenseTotals = useMemo(
    () => makeSelectExpenseTotalsByHousehold(householdId),
    [householdId],
  );
  const expenseTotals = useAppSelector(selectExpenseTotals);
  const completedVisitCount = visits.filter(
    (visit) => visit.status === 'completed',
  ).length;

  const recurringTotal =
    recurringView === 'monthly' ? expenseTotals.recurringMonthly : expenseTotals.recurringYearly;

  const daysSinceLitterChanged = useMemo(() => {
    const activeBoxIds = new Set(litterBoxes.filter((box) => box.isActive).map((box) => box.id));
    const latestChangedAtByBox = new Map<string, number>();

    litterEntries.forEach((entry) => {
      if (entry.changedAt === null || !activeBoxIds.has(entry.litterBoxId)) {
        return;
      }

      if ((latestChangedAtByBox.get(entry.litterBoxId) ?? 0) < entry.changedAt) {
        latestChangedAtByBox.set(entry.litterBoxId, entry.changedAt);
      }
    });

    if (latestChangedAtByBox.size === 0) {
      return null;
    }

    // The box that's gone longest without a change is the one that most needs attention.
    const mostOverdueChangedAt = Math.min(...latestChangedAtByBox.values());
    return getDaysSince(mostOverdueChangedAt);
  }, [litterBoxes, litterEntries]);

  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      <StatTile label='Visits so far' value={completedVisitCount} />

      <div className='rounded-lg border border-border bg-card p-4 text-center sm:text-left'>
        <div className='flex items-center justify-center gap-2 sm:justify-between'>
          <p className='text-sm text-muted-foreground'>Recurring expenses</p>
          <div className='flex items-center gap-1 rounded-md border border-border p-0.5'>
            <Button
              type='button'
              variant={recurringView === 'monthly' ? 'primary' : 'secondary'}
              size='sm'
              className={join('h-6 px-2 text-xs', recurringView !== 'monthly' && 'bg-transparent')}
              onClick={() => setRecurringView('monthly')}
            >
              Monthly
            </Button>
            <Button
              type='button'
              variant={recurringView === 'yearly' ? 'primary' : 'secondary'}
              size='sm'
              className={join('h-6 px-2 text-xs', recurringView !== 'yearly' && 'bg-transparent')}
              onClick={() => setRecurringView('yearly')}
            >
              Yearly
            </Button>
          </div>
        </div>
        <p className='mt-2 text-2xl font-semibold'>{currencyFormatter.format(recurringTotal)}</p>
      </div>

      <StatTile label='Lifetime expenses' value={currencyFormatter.format(expenseTotals.lifetime)} />

      {daysSinceLitterChanged !== null && (
        <StatTile
          label='Since litter changed'
          value={daysSinceLitterChanged === 0 ? 'Today' : `${daysSinceLitterChanged} day${daysSinceLitterChanged === 1 ? '' : 's'}`}
        />
      )}
    </div>
  );
}

export default StatsSummary;
