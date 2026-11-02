import type { EventPrefill } from '@apps/waypoint/components/EventFormModal';
import {
  DEFAULT_WATCHED_MEALS,
  MEAL_DEFAULT_TIMES,
  MEAL_TYPE_LABELS,
} from '@apps/waypoint/constants';
import type { MealType, TimelineEvent, TripSpace } from '@apps/waypoint/types';

export function getWatchedMeals(trip: TripSpace): readonly MealType[] {
  return trip.watchedMeals ?? DEFAULT_WATCHED_MEALS;
}

/** The watched meals with no dining event on the day; archived events don't count. */
export function getMissingMeals(
  events: TimelineEvent[],
  dayIndex: number,
  watchedMeals: readonly MealType[],
): MealType[] {
  const planned = events
    .filter(
      (event) =>
        event.dayIndex === dayIndex &&
        !event.isArchived &&
        event.eventType === 'DINING',
    )
    .map((event) =>
      event.eventDetails && 'mealType' in event.eventDetails
        ? event.eventDetails.mealType
        : null,
    );
  return watchedMeals.filter((meal) => !planned.includes(meal));
}

export function formatMissingMealsNote(missing: readonly MealType[]): string {
  const names = missing.map((meal) => MEAL_TYPE_LABELS[meal].toLowerCase());
  const list =
    names.length > 1
      ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
      : names[0];
  return `No ${list} planned`;
}

export function getMealPrefill(dayIndex: number, meal: MealType): EventPrefill {
  return {
    eventType: 'DINING',
    title: '',
    notes: null,
    linkUrl: null,
    cuisines: [],
    settings: [],
    dayIndex,
    time: meal === 'SNACK' ? '15:00' : MEAL_DEFAULT_TIMES[meal],
    mealType: meal,
  };
}
