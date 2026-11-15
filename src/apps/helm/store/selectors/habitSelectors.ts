import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenHabit } from '@apps/helm/types';
import { formatWeekdayDayUTC } from '@apps/helm/utils/taskDue';

const selectHabits = (state: RootState) => state.helm.habits.items;

const byName = (left: OpenHabit, right: OpenHabit) =>
  left.name.localeCompare(right.name);

/** Habits still kept, active or paused, A to Z; a retired one is never listed. */
export const selectKeptHabits = createSelector([selectHabits], (habits) =>
  habits
    .filter(
      (habit) =>
        !habit.isUnreadable &&
        (habit.status === 'active' || habit.status === 'paused'),
    )
    .sort(byName),
);

/** Habits the person stopped, the latest stopped first. */
export const selectStoppedHabits = createSelector([selectHabits], (habits) =>
  habits
    .filter((habit) => !habit.isUnreadable && habit.status === 'ended')
    .sort((left, right) => (right.endedAt ?? 0) - (left.endedAt ?? 0)),
);

/** Habits let go once formed, the latest first; their pages stay readable. */
export const selectFormedHabits = createSelector([selectHabits], (habits) =>
  habits
    .filter((habit) => !habit.isUnreadable && habit.status === 'retired')
    .sort((left, right) => (right.retiredAt ?? 0) - (left.retiredAt ?? 0)),
);

export const selectHabitById = createSelector(
  [selectHabits],
  (habits): Map<string, OpenHabit> =>
    new Map(habits.map((habit) => [habit.id, habit])),
);

export const selectHasHabits = (state: RootState) =>
  state.helm.habits.items.some((habit) => !habit.isUnreadable);

/** The week's figure for a habit: "N of M this week", or when nothing has been due yet, the day it starts. */
export const readWeekFigure = (
  habit: Pick<OpenHabit, 'startsOn'>,
  week: { done: number; due: number },
  dayKey: string,
) => {
  if (week.due > 0) return HELM_COPY.habitsWeekLine(week.done, week.due);
  const today = Date.parse(`${dayKey}T00:00:00Z`);
  if (habit.startsOn > today) {
    return HELM_COPY.habitsStartsOn(formatWeekdayDayUTC(habit.startsOn));
  }
  return habit.startsOn === today
    ? HELM_COPY.habitsStartsToday
    : HELM_COPY.habitsNothingYet;
};
