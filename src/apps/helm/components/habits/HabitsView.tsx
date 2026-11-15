import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CalendarCheck, ChevronRight } from 'lucide-react';

import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import { formatDateShort, formatDateShortUTC } from '@/utils/formatUtils';
import HabitQuestionFlow from '@apps/helm/components/habits/HabitQuestionFlow';
import { useHabitWhoName } from '@apps/helm/components/habits/useHabitWhoName';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import AddRow from '@apps/helm/components/who/AddRow';
import { HELM_COPY } from '@apps/helm/constants';
import { selectHabitWeek } from '@apps/helm/engine/habitDay';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import {
  readWeekFigure,
  selectFormedHabits,
  selectKeptHabits,
  selectStoppedHabits,
} from '@apps/helm/store/selectors/habitSelectors';
import type { OpenHabit } from '@apps/helm/types';
import { readHabitStatus } from '@apps/helm/utils/habitToday';
import { formatWeekdayDayUTC } from '@apps/helm/utils/taskDue';

interface HabitsViewProps {
  onBack: () => void;
  onHome: () => void;
  onOpenHabit: (habitId: string) => void;
}

interface HabitRowProps {
  habit: OpenHabit;
  line: string;
  onOpen: (habitId: string) => void;
}

function HabitRow({ habit, line, onOpen }: HabitRowProps) {
  const whoName = useHabitWhoName(habit);
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto min-h-14 w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={() => onOpen(habit.id)}
    >
      <span className='w-7 shrink-0 text-center text-2xl' aria-hidden='true'>
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
          {whoName === null
            ? line
            : `${HELM_COPY.habitForWho(whoName)}\u00a0· ${line}`}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

/** Habits: every one kept, A to Z, each with its week; the ones stopped behind a thin row. A new one is the last row of the list. */
function HabitsView({ onBack, onHome, onOpenHabit }: HabitsViewProps) {
  const clock = useHabitClock();
  const { isLoaded, isFailed } = useAppSelector((state) => state.helm.habits);
  const days = useAppSelector((state) => state.helm.habitDays.byId);
  const kept = useAppSelector(selectKeptHabits);
  const stopped = useAppSelector(selectStoppedHabits);
  const formed = useAppSelector(selectFormedHabits);
  const [isFormedOpen, setIsFormedOpen] = useState(false);
  const [isStoppedOpen, setIsStoppedOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useScreenContext('habits', null, [], {
    ask: HELM_COPY.askHabits,
    chip: HELM_COPY.chipHabits,
    back: HELM_COPY.backToHabits,
  });

  const readLine = (habit: OpenHabit) => {
    if (habit.status === 'retired' && habit.retiredAt !== null) {
      return HELM_COPY.habitsFormedOn(formatDateShort(habit.retiredAt));
    }
    if (habit.status === 'ended' && habit.endedAt !== null) {
      return HELM_COPY.habitsStoppedOn(formatDateShortUTC(habit.endedAt));
    }
    if (
      habit.status === 'paused' &&
      readHabitStatus(habit, clock.dayKey) === 'paused' &&
      habit.pausedUntil !== null
    ) {
      return HELM_COPY.habitsPausedUntil(
        formatWeekdayDayUTC(habit.pausedUntil),
      );
    }
    const week = selectHabitWeek(
      { ...habit, status: 'active' },
      days,
      clock.dayKey,
      clock.timeZone,
    );
    return readWeekFigure(habit, week, clock.dayKey);
  };

  const start = () => setIsStarting(true);

  return (
    <>
      <HelmHeader backLabel='Home' onBack={onBack} onHome={onHome} />
      <main className='space-y-4 pt-4'>
        <h1 className='helm-serif text-[28px] leading-[34px]'>
          {HELM_COPY.habitsTitle}
        </h1>
        {isFailed && !isLoaded && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.habitsFailed}
          </p>
        )}
        {isLoaded &&
          kept.length === 0 &&
          stopped.length === 0 &&
          formed.length === 0 && (
            <>
              <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
                {HELM_COPY.habitsEmpty}
              </p>
              <AddRow label={HELM_COPY.habitsAdd} onClick={start} />
            </>
          )}
        {kept.length > 0 && (
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {kept.map((habit) => (
              <li key={habit.id}>
                <HabitRow
                  habit={habit}
                  line={readLine(habit)}
                  onOpen={onOpenHabit}
                />
              </li>
            ))}
            <li>
              <AddRow label={HELM_COPY.habitsAdd} onClick={start} isInList />
            </li>
          </ul>
        )}
        {formed.length > 0 && (
          <section className='space-y-3'>
            <ShowMoreButton
              isOpen={isFormedOpen}
              onClick={() => setIsFormedOpen((isOpen) => !isOpen)}
            >
              {HELM_COPY.habitsFormedFold(formed.length)}
            </ShowMoreButton>
            {isFormedOpen && (
              <ul className='helm-card divide-border divide-y overflow-hidden'>
                {formed.map((habit) => (
                  <li key={habit.id}>
                    <HabitRow
                      habit={habit}
                      line={readLine(habit)}
                      onOpen={onOpenHabit}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {stopped.length > 0 && (
          <section className='space-y-3'>
            <ShowMoreButton
              isOpen={isStoppedOpen}
              onClick={() => setIsStoppedOpen((isOpen) => !isOpen)}
            >
              {isStoppedOpen
                ? HELM_COPY.habitsStoppedHide
                : HELM_COPY.habitsStoppedRow(stopped.length)}
            </ShowMoreButton>
            {isStoppedOpen && (
              <ul className='helm-card divide-border divide-y overflow-hidden'>
                {stopped.map((habit) => (
                  <li key={habit.id}>
                    <HabitRow
                      habit={habit}
                      line={readLine(habit)}
                      onOpen={onOpenHabit}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
      <HabitQuestionFlow
        isOpen={isStarting}
        onClose={() => setIsStarting(false)}
        onOpenHabit={onOpenHabit}
      />
    </>
  );
}

export default HabitsView;
