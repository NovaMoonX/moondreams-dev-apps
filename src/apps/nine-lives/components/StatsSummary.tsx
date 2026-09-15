import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAppSelector } from '@/store';

import { makeSelectExpenseTotalsByHousehold, selectVisitsByHousehold } from '../store/selectors';
import StatTile from './StatTile';

interface StatsSummaryProps {
  householdId: string;
}

type RecurringView = 'monthly' | 'yearly';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function StatsSummary({ householdId }: StatsSummaryProps) {
  const [recurringView, setRecurringView] = useState<RecurringView>('monthly');

  const visits = useAppSelector(selectVisitsByHousehold(householdId));
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

  return (
    <div className='grid gap-4 sm:grid-cols-3'>
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
    </div>
  );
}

export default StatsSummary;
