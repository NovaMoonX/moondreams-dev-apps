import { useAppSelector } from '@/store';

import {
  selectLifetimeExpenseTotalByHousehold,
  selectMonthlyExpenseTotalByHousehold,
  selectVisitsByHousehold,
} from '../store/selectors';
import StatTile from './StatTile';

interface StatsSummaryProps {
  householdId: string;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function StatsSummary({ householdId }: StatsSummaryProps) {
  const visits = useAppSelector(selectVisitsByHousehold(householdId));
  const monthlyExpenseTotal = useAppSelector(selectMonthlyExpenseTotalByHousehold(householdId));
  const lifetimeExpenseTotal = useAppSelector(selectLifetimeExpenseTotalByHousehold(householdId));
  const completedVisitCount = visits.filter(
    (visit) => visit.status === 'completed',
  ).length;

  return (
    <div className='grid gap-4 sm:grid-cols-3'>
      <StatTile label='Visits so far' value={completedVisitCount} />
      <StatTile label='Monthly expenses' value={currencyFormatter.format(monthlyExpenseTotal)} />
      <StatTile label='Lifetime expenses' value={currencyFormatter.format(lifetimeExpenseTotal)} />
    </div>
  );
}

export default StatsSummary;
