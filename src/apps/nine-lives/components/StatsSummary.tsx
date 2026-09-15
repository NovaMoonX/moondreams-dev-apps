import { useAppSelector } from '@/store';

import { selectVisitsByHousehold } from '../store/selectors';
import StatTile from './StatTile';

interface StatsSummaryProps {
  householdId: string;
}

function StatsSummary({ householdId }: StatsSummaryProps) {
  const visits = useAppSelector(selectVisitsByHousehold(householdId));
  const completedVisitCount = visits.filter(
    (visit) => visit.status === 'completed',
  ).length;

  return (
    <div className='grid gap-4 sm:grid-cols-2'>
      <StatTile label='Visits so far' value={completedVisitCount} />
      <StatTile label='Total cost so far' value='$0' />
    </div>
  );
}

export default StatsSummary;
