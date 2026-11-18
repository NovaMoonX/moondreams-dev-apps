import { useAppSelector } from '@/store';
import { formatDateShort, formatDateShortUTC } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { selectHabitWeek } from '@apps/helm/engine/habitDay';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import {
  readPausedLine,
  readWeekFigure,
} from '@apps/helm/store/selectors/habitSelectors';
import type { OpenHabit } from '@apps/helm/types';

/** The line a habit's row shows in every list: its week, or why it is not running. */
export function useHabitListLine() {
  const clock = useHabitClock();
  const days = useAppSelector((state) => state.helm.habitDays.byId);

  return (habit: OpenHabit) => {
    if (habit.status === 'retired' && habit.retiredAt !== null) {
      return HELM_COPY.habitsFormedOn(formatDateShort(habit.retiredAt));
    }
    if (habit.status === 'ended' && habit.endedAt !== null) {
      return HELM_COPY.habitsStoppedOn(formatDateShortUTC(habit.endedAt));
    }
    const pausedLine = readPausedLine(habit, clock.dayKey);
    if (pausedLine) return pausedLine;
    const week = selectHabitWeek(
      { ...habit, status: 'active' },
      days,
      clock.dayKey,
      clock.timeZone,
    );
    return readWeekFigure(habit, week, clock.dayKey);
  };
}
