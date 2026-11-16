import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CalendarCheck, ChevronRight } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import HabitQuestionFlow from '@apps/helm/components/habits/HabitQuestionFlow';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import AddRow from '@apps/helm/components/who/AddRow';
import { HELM_COPY } from '@apps/helm/constants';
import { selectHabitWeek } from '@apps/helm/engine/habitDay';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import {
  readPausedLine,
  readWeekFigure,
} from '@apps/helm/store/selectors/habitSelectors';

interface GoalHabitsProps {
  projectId: string;
  onOpenHabit: (habitId: string) => void;
}

/** The goal's regular steps: its habits as rows that open the habit's page (no tick here), then the add row. */
function GoalHabits({ projectId, onOpenHabit }: GoalHabitsProps) {
  const clock = useHabitClock();
  const habits = useAppSelector((state) => state.helm.habits.items);
  const days = useAppSelector((state) => state.helm.habitDays.byId);
  const [isAdding, setIsAdding] = useState(false);
  const mine = habits
    .filter(
      (habit) =>
        !habit.isUnreadable &&
        habit.projectId === projectId &&
        habit.status !== 'ended',
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  const readLine = (habit: (typeof mine)[number]) =>
    readPausedLine(habit, clock.dayKey) ??
    readWeekFigure(
      habit,
      selectHabitWeek(
        { ...habit, status: 'active' },
        days,
        clock.dayKey,
        clock.timeZone,
      ),
      clock.dayKey,
    );

  return (
    <section className='space-y-3'>
      <SectionDivider label={HELM_COPY.goalHabitsHeading} />
      {mine.length === 0 ? (
        <>
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.goalHabitsNone}
          </p>
          <AddRow
            label={HELM_COPY.goalHabitsAdd}
            onClick={() => setIsAdding(true)}
          />
        </>
      ) : (
        <ul className='helm-card divide-border divide-y overflow-hidden'>
          {mine.map((habit) => (
            <li key={habit.id}>
              <Button
                type='button'
                variant='tertiary'
                className='flex h-auto min-h-14 w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
                onClick={() => onOpenHabit(habit.id)}
              >
                <span
                  className='w-7 shrink-0 text-center text-2xl'
                  aria-hidden='true'
                >
                  {habit.emoji ?? (
                    <CalendarCheck className='text-muted-foreground mx-auto size-5' />
                  )}
                </span>
                <span className='min-w-0 flex-1'>
                  <PrivateTitle
                    kind='habit'
                    record={habit}
                    className='text-foreground text-[15px] leading-[21px]'
                  >
                    {habit.name}
                  </PrivateTitle>
                  <span className='text-muted-foreground block text-[13px] break-words'>
                    {readLine(habit)}
                  </span>
                </span>
                <ChevronRight
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
              </Button>
            </li>
          ))}
          <li>
            <AddRow
              label={HELM_COPY.goalHabitsAdd}
              onClick={() => setIsAdding(true)}
              isInList
            />
          </li>
        </ul>
      )}
      <HabitQuestionFlow
        isOpen={isAdding}
        onClose={() => setIsAdding(false)}
        onOpenHabit={onOpenHabit}
        projectId={projectId}
      />
    </section>
  );
}

export default GoalHabits;
