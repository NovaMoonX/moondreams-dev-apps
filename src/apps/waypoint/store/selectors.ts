import type { RootState } from '@/store';
import {
  getPerPersonMultiplier,
  getSplitMemberIds,
  scaleAmount,
} from '@apps/waypoint/utils/splitCalculators';
import type {
  EventStatus,
  Stay,
  TimelineEvent,
  TripExpense,
  TripSpace,
  TripStatus,
} from '@apps/waypoint/types';

const REMINDER_WINDOW_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const selectTrips = (state: RootState) => state.waypoint.trip.items;

export function getTripStatus(trip: TripSpace, now: number): TripStatus {
  if (now < trip.startDate) {
    return 'UPCOMING';
  }
  if (now >= trip.endDate) {
    return 'PAST';
  }
  return 'ACTIVE';
}

export const selectTripById =
  (tripId: string | null | undefined) => (state: RootState) =>
    tripId
      ? (state.waypoint.trip.items.find((trip) => trip.id === tripId) ?? null)
      : null;

export function selectShouldShowAlbumReminder(
  state: RootState,
  tripId: string,
  currentUserId: string,
  now = Date.now(),
) {
  const trip = state.waypoint.trip.items.find((item) => item.id === tripId);
  if (!trip || now < trip.startDate || now > trip.endDate + DAY_MS) {
    return false;
  }

  const dayEnd = Math.min(
    trip.endDate + DAY_MS,
    trip.startDate +
      (Math.floor((now - trip.startDate) / DAY_MS) + 1) * DAY_MS,
  );
  const isNearEnd = now >= dayEnd - REMINDER_WINDOW_MS;
  const canSetAlbum =
    trip.members[currentUserId]?.role === 'ADMIN' ||
    trip.members[currentUserId]?.role === 'EDITOR';

  return isNearEnd && (trip.sharedAlbumUrl !== null || canSetAlbum);
}

export const selectTripExpenses = (state: RootState) =>
  state.waypoint.expenses.items;

interface ExpenseTotal {
  min: number;
  max: number;
}

export interface TripExpenseTotals {
  paid: ExpenseTotal;
  expected: ExpenseTotal;
  total: ExpenseTotal;
}

function getExpenseValue(expense: TripExpense, memberIds: string[]): ExpenseTotal {
  const multiplier = getPerPersonMultiplier(expense, getSplitMemberIds(expense, memberIds));

  if (expense.amount !== null) {
    const amount = scaleAmount(expense.amount, multiplier);
    return { min: amount, max: amount };
  }

  if (expense.status === 'PAID' && expense.paidAmount !== null) {
    const paidAmount = scaleAmount(expense.paidAmount, multiplier);
    return { min: paidAmount, max: paidAmount };
  }

  const range = {
    min: scaleAmount(expense.amountMin ?? 0, multiplier),
    max: scaleAmount(expense.amountMax ?? expense.amountMin ?? 0, multiplier),
  };
  return range;
}

function addExpenseValue(total: ExpenseTotal, expense: TripExpense, memberIds: string[]) {
  const value = getExpenseValue(expense, memberIds);
  total.min += value.min;
  total.max += value.max;
}

export function computeExpenseTotals(
  expenses: TripExpense[],
  memberIds: string[],
): TripExpenseTotals {
  const totals: TripExpenseTotals = {
    paid: { min: 0, max: 0 },
    expected: { min: 0, max: 0 },
    total: { min: 0, max: 0 },
  };

  for (const expense of expenses) {
    addExpenseValue(totals.total, expense, memberIds);
    addExpenseValue(expense.status === 'PAID' ? totals.paid : totals.expected, expense, memberIds);
  }

  return totals;
}

export const selectTripExpenseTotals = (state: RootState): TripExpenseTotals => {
  const trip = state.waypoint.trip.items.find(
    (item) => item.id === state.waypoint.expenses.tripId,
  );
  const totals = computeExpenseTotals(
    state.waypoint.expenses.items,
    trip ? Object.keys(trip.members) : [],
  );
  return totals;
};

export const selectTimelineEvents = (state: RootState) => state.waypoint.events.items;

export const selectStays = (state: RootState) => state.waypoint.stays.items;

export const selectActiveStaysForDay =
  (dayIndex: number) => (state: RootState): Stay[] => {
    const trip = state.waypoint.trip.items.find(
      (item) => item.id === state.waypoint.stays.tripId,
    );
    if (!trip) {
      return [];
    }

    const dayStart = trip.startDate + dayIndex * 86_400_000;
    const dayEnd = dayStart + 86_400_000;
    return state.waypoint.stays.items.filter(
      (stay) =>
        stay.plannedArrivalAt < dayEnd && stay.plannedDepartureAt >= dayStart,
    );
  };

export const selectEventsByDay =
  (dayIndex: number) => (state: RootState) =>
    state.waypoint.events.items.filter((event) => event.dayIndex === dayIndex);

/** Event Active Status Machine: UPCOMING -> now >= startAt -> ACTIVE -> now >= endAt -> COMPLETED. An event without an endAt stays ACTIVE once started. */
export function getEventStatus(event: TimelineEvent, now: number): EventStatus {
  if (now < event.startAt) {
    return 'UPCOMING';
  }
  if (event.endAt !== null && now >= event.endAt) {
    return 'COMPLETED';
  }
  return 'ACTIVE';
}

// Among simultaneously active events, the one that started most recently is treated as "the" active event.
export const selectActiveEvent =
  (now: number) => (state: RootState): TimelineEvent | null => {
    const activeEvents = state.waypoint.events.items.filter(
      (event) => getEventStatus(event, now) === 'ACTIVE',
    );
    if (activeEvents.length === 0) {
      return null;
    }
    return activeEvents.reduce((latest, event) =>
      event.startAt > latest.startAt ? event : latest,
    );
  };

export const selectUpNextEvent =
  (now: number) => (state: RootState): TimelineEvent | null => {
    const upcomingEvents = state.waypoint.events.items.filter(
      (event) => getEventStatus(event, now) === 'UPCOMING',
    );
    if (upcomingEvents.length === 0) {
      return null;
    }
    return upcomingEvents.reduce((soonest, event) =>
      event.startAt < soonest.startAt ? event : soonest,
    );
  };
