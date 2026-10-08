import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { getDayCount, getLocalDayIndex } from '@/utils/dateRangeUtils';
import { compareDayTime } from '@/utils/dayTimeUtils';
import {
  getPerPersonMultiplier,
  getSplitMemberIds,
  scaleAmount,
} from '@apps/waypoint/utils/splitCalculators';
import { isEventForMember } from '@apps/waypoint/utils/attendeeCalculators';
import { getExpenseLinkKey } from '@apps/waypoint/utils/relatedSubjects';
import { getEventTime, getStayTime, isRelativeTrip } from '@apps/waypoint/utils/tripTime';
import type {
  Announcement,
  EventStatus,
  EventSuggestion,
  IdeaType,
  Rental,
  Stay,
  TimelineEvent,
  PersonalExpense,
  TripExpense,
  TripIdea,
  TripSpace,
  TripStatus,
} from '@apps/waypoint/types';

const REMINDER_WINDOW_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const selectTrips = (state: RootState) => state.waypoint.trip.items;

/** Judged by the viewer's local calendar day, so the trip's last day still counts as active. */
export function getTripStatus(trip: TripSpace, now: number): TripStatus {
  const dayIndex = getLocalDayIndex(trip.startDate, now);
  if (dayIndex < 0) {
    return 'UPCOMING';
  }
  if (dayIndex >= getDayCount(trip.startDate, trip.endDate)) {
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

/** Keys (`getExpenseLinkKey`) of every event, stay and rental that has an expense attached. */
export const selectExpenseLinkKeys = createSelector(
  [selectTripExpenses],
  (expenses): ReadonlySet<string> =>
    new Set(expenses.flatMap((expense) => (expense.linkedTo ? [getExpenseLinkKey(expense.linkedTo)] : []))),
);

/** Keys of plans marked "no expense needed", across the trips in the store. */
export const selectNoExpenseKeys = createSelector(
  [selectTrips],
  (trips): ReadonlySet<string> => new Set(trips.flatMap((trip) => trip.noExpenseKeys ?? [])),
);

export const selectPersonalChecklistItems = (state: RootState) => state.waypoint.personalChecklist.items;

export const selectPersonalExpenses = (state: RootState) =>
  state.waypoint.personalExpenses.items;

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

const roundCents = (value: number) => Math.round(value * 100) / 100;

/** The viewer's own private expenses, summed by status. */
export function computePersonalTotals(expenses: PersonalExpense[]) {
  const sum = (items: PersonalExpense[]) => roundCents(items.reduce((total, item) => total + item.amount, 0));
  return {
    paid: sum(expenses.filter((expense) => expense.status === 'PAID')),
    expected: sum(expenses.filter((expense) => expense.status !== 'PAID')),
    total: sum(expenses),
  };
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

/** True once every trip-scoped listener has delivered its first snapshot for this trip, so
 * a section never renders its empty state (or the previous trip's items) while data is in flight. */
export const selectIsTripDataLoaded = (state: RootState, tripId: string) =>
  [
    state.waypoint.events,
    state.waypoint.stays,
    state.waypoint.rentals,
    state.waypoint.ideas,
    state.waypoint.checklist,
    state.waypoint.expenses,
    state.waypoint.eventSuggestions,
    state.waypoint.announcements,
  ].every((slice) => slice.loaded && slice.tripId === tripId);

export const selectTimelineEvents = (state: RootState) => state.waypoint.events.items;

export const selectStays = (state: RootState) => state.waypoint.stays.items;

const selectEventsTrip = (state: RootState) =>
  state.waypoint.trip.items.find((item) => item.id === state.waypoint.events.tripId) ?? null;

const selectStaysTrip = (state: RootState) =>
  state.waypoint.trip.items.find((item) => item.id === state.waypoint.stays.tripId) ?? null;

/** Earliest first; events with no day sort last. Legacy trips keep their exact-instant order. */
export const selectSortedTimelineEvents = createSelector(
  [selectTimelineEvents, selectEventsTrip],
  (events, trip): TimelineEvent[] => {
    if (!trip) {
      return events;
    }

    const keyed = events.map((event) => ({ event, time: getEventTime(trip, event) }));
    const sorted = keyed
      .sort((a, b) => {
        if (!isRelativeTrip(trip)) {
          return (a.time.startMs ?? 0) - (b.time.startMs ?? 0);
        }
        if (a.time.dayIndex === null || b.time.dayIndex === null) {
          return Number(a.time.dayIndex === null) - Number(b.time.dayIndex === null);
        }
        return compareDayTime(
          { day: a.time.dayIndex, time: a.time.startTime ?? '00:00' },
          { day: b.time.dayIndex, time: b.time.startTime ?? '00:00' },
        );
      })
      .map(({ event }) => event);
    return sorted;
  },
);

export const selectSortedStays = createSelector(
  [selectStays, selectStaysTrip],
  (stays, trip): Stay[] => {
    if (!trip) {
      return stays;
    }

    const keyed = stays.map((stay) => ({ stay, time: getStayTime(trip, stay).plannedArrival }));
    const sorted = keyed
      .sort((a, b) =>
        compareDayTime(
          { day: a.time.dayIndex ?? 0, time: a.time.time ?? '00:00' },
          { day: b.time.dayIndex ?? 0, time: b.time.time ?? '00:00' },
        ),
      )
      .map(({ stay }) => stay);
    return sorted;
  },
);

export const selectRentals = (state: RootState) => state.waypoint.rentals.items;

/** Earliest pickup first. */
export const selectSortedRentals = createSelector([selectRentals], (rentals): Rental[] => {
  const sorted = [...rentals].sort((a, b) =>
    compareDayTime(
      { day: a.pickupDayIndex, time: a.pickupTime },
      { day: b.pickupDayIndex, time: b.pickupTime },
    ),
  );
  return sorted;
});

export const selectActiveStaysForDay =
  (dayIndex: number) => (state: RootState): Stay[] => {
    const trip = state.waypoint.trip.items.find(
      (item) => item.id === state.waypoint.stays.tripId,
    );
    if (!trip) {
      return [];
    }

    return state.waypoint.stays.items.filter((stay) => {
      const { plannedArrival, plannedDeparture } = getStayTime(trip, stay);
      return (
        plannedArrival.dayIndex !== null &&
        plannedDeparture.dayIndex !== null &&
        plannedArrival.dayIndex <= dayIndex &&
        dayIndex <= plannedDeparture.dayIndex
      );
    });
  };

export const selectEventSuggestionsForEvent =
  (eventId: string) => (state: RootState): EventSuggestion[] =>
    state.waypoint.eventSuggestions.items.filter((suggestion) => suggestion.eventId === eventId);

const selectIdeasState = (state: RootState) => state.waypoint.ideas;

/** Decided ideas (already on the itinerary) sink; otherwise most votes first, then newest. */
export const selectSortedIdeas = createSelector(
  [selectIdeasState, (_state: RootState, tripId: string) => tripId],
  (ideasState, tripId): TripIdea[] =>
    ideasState.tripId !== tripId
      ? []
      : [...ideasState.items].sort(
          (a, b) =>
            Number(a.convertedToEntityId !== null) - Number(b.convertedToEntityId !== null) ||
            b.voterUids.length - a.voterUids.length ||
            b.createdAt - a.createdAt,
        ),
);

export function filterIdeasByType(ideas: TripIdea[], ideaType: IdeaType | null): TripIdea[] {
  return ideaType === null ? ideas : ideas.filter((idea) => idea.ideaType === ideaType);
}

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
  (dayIndex: number, trip: TripSpace, uid: string) => (state: RootState) =>
    state.waypoint.events.items.filter(
      (event) => event.dayIndex === dayIndex && isEventForMember(event, Object.keys(trip.members), uid),
    );

/** Timestamp of an event's most recent post-trip-start activity (creation or a tracked
 * field edit), or 0 if it has none — `changeHistory` entries are only ever appended while
 * the trip is active, and `createdAt >= trip.startDate` can only be true if the trip had
 * already started at creation time, so both checks are naturally already "post-start." */
export function getEventLastActivityAt(event: TimelineEvent, trip: TripSpace) {
  const createdWhileLive = event.createdAt >= trip.startDate ? event.createdAt : 0;
  // Events and stays saved before activity tracking existed have no history or seenBy yet.
  const lastChangeAt = (event.changeHistory ?? []).at(-1)?.latestChangedAt ?? 0;
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
  const lastChangeAt = (stay.changeHistory ?? []).at(-1)?.latestChangedAt ?? 0;
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

/** Event Active Status Machine: UPCOMING -> now >= start -> ACTIVE -> now >= end -> COMPLETED. An event
 * without an end implicitly ends at the end of its own day, so it doesn't stay ACTIVE forever (and doesn't
 * resurface as Active Now once a later event on the same day has finished). `null` when the event has no
 * day or sits outside the trip's dates, so it can never be live. */
export function getEventStatus(trip: TripSpace, event: TimelineEvent, now: number): EventStatus | null {
  const { startMs, impliedEndMs } = getEventTime(trip, event);
  if (startMs === null || impliedEndMs === null) {
    return null;
  }
  if (now < startMs) {
    return 'UPCOMING';
  }
  if (now >= impliedEndMs) {
    return 'COMPLETED';
  }
  return 'ACTIVE';
}

// Among simultaneously active events, the one that started most recently is treated as "the" active event.
// Only events `uid` is part of count: Overview is about what's happening to them.
export const selectActiveEvent =
  (trip: TripSpace, now: number, uid: string) => (state: RootState): TimelineEvent | null => {
    const memberIds = Object.keys(trip.members);
    const activeEvents = state.waypoint.events.items.filter(
      (event) => isEventForMember(event, memberIds, uid) && getEventStatus(trip, event, now) === 'ACTIVE',
    );
    if (activeEvents.length === 0) {
      return null;
    }
    return activeEvents.reduce((latest, event) =>
      (getEventTime(trip, event).startMs ?? 0) > (getEventTime(trip, latest).startMs ?? 0) ? event : latest,
    );
  };

export const selectUpNextEvent =
  (trip: TripSpace, now: number, uid: string) => (state: RootState): TimelineEvent | null => {
    const memberIds = Object.keys(trip.members);
    const upcomingEvents = state.waypoint.events.items.filter(
      (event) => isEventForMember(event, memberIds, uid) && getEventStatus(trip, event, now) === 'UPCOMING',
    );
    if (upcomingEvents.length === 0) {
      return null;
    }
    return upcomingEvents.reduce((soonest, event) =>
      (getEventTime(trip, event).startMs ?? 0) < (getEventTime(trip, soonest).startMs ?? 0) ? event : soonest,
    );
  };
