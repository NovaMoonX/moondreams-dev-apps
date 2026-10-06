import { shallowEqual } from 'react-redux';

import { useAppSelector } from '@/store';
import { formatDuration } from '@/utils/formatUtils';
import StatTile from '@/components/StatTile';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import WeekResetHelp from '@apps/a-list/components/shared/WeekResetHelp';
import { selectCounters } from '@apps/a-list/store/selectors';

interface CounterRowProps {
  now: number;
}

function CounterRow({ now }: CounterRowProps) {
  const counters = useAppSelector(
    (state) => selectCounters(state, now),
    shallowEqual,
  );

  const { openOverlay } = useAListOverlay();
  const getGoalPrompt = (ariaLabel: string) => ({
    label: '🎯 Set',
    ariaLabel,
    onClick: () => openOverlay({ kind: 'membership' }),
  });

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
            ? formatDuration(counters.watchedMinutes * 60_000)
            : undefined
        }
      />
      <StatTile
        isStacked
        icon='📅'
        value={getGoalValue(counters.thisWeek, counters.weeklyGoal)}
        label='Since Friday'
        help={<WeekResetHelp />}
        goal={
          counters.weeklyGoal === null
            ? undefined
            : { current: counters.thisWeek, target: counters.weeklyGoal }
        }
        prompt={
          counters.weeklyGoal === null
            ? getGoalPrompt('Set a weekly goal')
            : undefined
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
        prompt={
          counters.monthlyGoal === null
            ? getGoalPrompt('Set a monthly goal')
            : undefined
        }
      />
    </div>
  );
}

export default CounterRow;
