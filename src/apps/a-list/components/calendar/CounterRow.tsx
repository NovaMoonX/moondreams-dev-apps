import { shallowEqual } from 'react-redux';

import { useAppSelector } from '@/store';
import { formatDuration } from '@/utils/formatUtils';
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

  const getGoalValue = (current: number, goal: number | null) =>
    goal === null ? current : `${current}/${goal}`;

  return (
    <div className='grid grid-cols-3 gap-2 sm:gap-3'>
      <StatTile
        isStacked
        icon='🎞️'
        value={counters.watched}
        label='Watched'
        detail={
          counters.watchedMinutes > 0
            ? `${formatDuration(counters.watchedMinutes * 60_000)} in theaters`
            : undefined
        }
      />
      <StatTile
        isStacked
        icon='📅'
        value={getGoalValue(counters.thisWeek, counters.weeklyGoal)}
        label='This week'
        goal={
          counters.weeklyGoal === null
            ? undefined
            : { current: counters.thisWeek, target: counters.weeklyGoal }
        }
      />
      <StatTile
        isStacked
        icon='🗓️'
        value={getGoalValue(counters.thisMonth, counters.monthlyGoal)}
        label='This month'
        goal={
          counters.monthlyGoal === null
            ? undefined
            : { current: counters.thisMonth, target: counters.monthlyGoal }
        }
      />
    </div>
  );
}

export default CounterRow;
