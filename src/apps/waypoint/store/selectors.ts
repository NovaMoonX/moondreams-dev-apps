import type { RootState } from '@/store';
import { getEndOfLocalDay } from '@/utils/dateInputUtils';
import {
  getPerPersonMultiplier,
  getSplitMemberIds,
  scaleAmount,
} from '@apps/waypoint/utils/splitCalculators';
import type {
  Announcement,
  EventStatus,
  EventSuggestion,
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

export const selectEventSuggestionsForEvent =
  (eventId: string) => (state: RootState): EventSuggestion[] =>
    state.waypoint.eventSuggestions.items.filter((suggestion) => suggestion.eventId === eventId);

export const selectLiveAnnouncements =
  (uid: string, now: number) => (state: RootState): Announcement[] =>
    state.waypoint.announcements.items
      .filter(
        (announcement) =>
          (announcement.expiresAt === null || announcement.expiresAt > now) &&
          !(uid in announcement.dismissedBy),
      )
      .sort((a, b) => b.createdAt - a.createdAt);

export const selectEventsByDay =
  (dayIndex: number) => (state: RootState) =>
    state.waypoint.events.items.filter((event) => event.dayIndex === dayIndex);

/** Timestamp of an event's most recent post-trip-start activity (creation or a tracked
 * field edit), or 0 if it has none — `changeHistory` entries are only ever appended while
 * the trip is active, and `createdAt >= trip.startDate` can only be true if the trip had
 * already started at creation time, so both checks are naturally already "post-start." */
export function getEventLastActivityAt(event: TimelineEvent, trip: TripSpace) {
  const createdWhileLive = event.createdAt >= trip.startDate ? event.createdAt : 0;
  const lastChangeAt = event.changeHistory.at(-1)?.latestChangedAt ?? 0;
  const archivedAt = event.archivedAt ?? 0;
  return Math.max(createdWhileLive, lastChangeAt, archivedAt);
}

export function isEventActivityUnseen(event: TimelineEvent, trip: TripSpace, uid: string) {
  return getEventLastActivityAt(event, trip) > (event.seenBy?.[uid] ?? 0);
}

// Archiving is its own activity worth surfacing, so an archived event isn't excluded
// outright — it only drops out once its latest activity (including the archive) is seen.
export const selectUnseenActivityEvents =
  (trip: TripSpace, uid: string) => (state: RootState): TimelineEvent[] =>
    state.waypoint.events.items
      .filter((event) => isEventActivityUnseen(event, trip, uid))
      .sort((a, b) => getEventLastActivityAt(b, trip) - getEventLastActivityAt(a, trip));

/** Same idea as `getEventLastActivityAt`, for stays — a stay has no archive concept, so
 * only its creation and tracked-field edits count as activity. */
export function getStayLastActivityAt(stay: Stay, trip: TripSpace) {
  const createdWhileLive = stay.createdAt >= trip.startDate ? stay.createdAt : 0;
  const lastChangeAt = stay.changeHistory.at(-1)?.latestChangedAt ?? 0;
  return Math.max(createdWhileLive, lastChangeAt);
}

export function isStayActivityUnseen(stay: Stay, trip: TripSpace, uid: string) {
  return getStayLastActivityAt(stay, trip) > (stay.seenBy?.[uid] ?? 0);
}

export const selectUnseenActivityStays =
  (trip: TripSpace, uid: string) => (state: RootState): Stay[] =>
    state.waypoint.stays.items
      .filter((stay) => isStayActivityUnseen(stay, trip, uid))
      .sort((a, b) => getStayLastActivityAt(b, trip) - getStayLastActivityAt(a, trip));

/** Event Active Status Machine: UPCOMING -> now >= startAt -> ACTIVE -> now >= endAt -> COMPLETED. An
 * event without an endAt implicitly ends at the end of its own local calendar day, so it doesn't stay
 * ACTIVE forever (and doesn't resurface as Active Now once a later event on the same day has finished). */
export function getEventStatus(event: TimelineEvent, now: number): EventStatus {
  if (now < event.startAt) {
    return 'UPCOMING';
  }
  const impliedEndAt = event.endAt ?? getEndOfLocalDay(event.startAt);
  if (now >= impliedEndAt) {
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
