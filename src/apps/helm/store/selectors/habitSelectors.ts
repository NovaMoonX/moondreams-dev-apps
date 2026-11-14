import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { OpenHabit } from '@apps/helm/types';

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

export const selectHabitById = createSelector(
  [selectHabits],
  (habits): Map<string, OpenHabit> =>
    new Map(habits.map((habit) => [habit.id, habit])),
);

export const selectHasHabits = (state: RootState) =>
  state.helm.habits.items.some(
    (habit) => habit.status !== 'retired' && !habit.isUnreadable,
  );
