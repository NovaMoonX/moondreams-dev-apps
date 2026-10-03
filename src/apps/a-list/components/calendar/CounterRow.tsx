import { shallowEqual } from 'react-redux';

import { useAppSelector } from '@/store';
import GoalChip from '@apps/a-list/components/shared/GoalChip';
import StatTile from '@apps/a-list/components/shared/StatTile';
import { selectCounters } from '@apps/a-list/store/selectors';

interface CounterRowProps {
  now: number;
}

function CounterRow({ now }: CounterRowProps) {
  const counters = useAppSelector(
    (state) => selectCounters(state, now),
    shallowEqual,
  );
  const hasGoals =
    counters.weeklyGoal !== null || counters.monthlyGoal !== null;

  return (
    <div className='space-y-2'>
      <div className='grid grid-cols-2 gap-3'>
        <StatTile icon='🎞️' value={counters.watched} label='Watched' />
        <StatTile
          icon='📅'
          value={
            counters.weeklyGoal === null
              ? counters.thisWeek
              : `${counters.thisWeek}/${counters.weeklyGoal}`
          }
          label='This week'
        />
      </div>
      {hasGoals && (
        <div className='flex flex-wrap gap-2'>
          <GoalChip
            label='Weekly goal'
            goal={counters.weeklyGoal}
            isMet={counters.isWeeklyGoalMet}
          />
          <GoalChip
            label='Monthly goal'
            goal={counters.monthlyGoal}
            isMet={counters.isMonthlyGoalMet}
          />
        </div>
      )}
    </div>
  );
}

export default CounterRow;
