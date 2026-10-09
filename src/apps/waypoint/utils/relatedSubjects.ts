import type {
  ChecklistCategory,
  EventType,
  ExpenseCategory,
  ExpenseLink,
  Rental,
  Stay,
  TimelineEvent,
  TripSpace,
} from '@apps/waypoint/types';
import { BOOKING_TRACKED_EVENT_TYPES, EVENT_TYPE_EMOJIS, TODO_TRACKED_EVENT_TYPES, STAY_TYPE_EMOJIS, TRANSIT_TYPE_EMOJIS } from '@apps/waypoint/constants';
import { getEventTime, getStayTime } from '@apps/waypoint/utils/tripTime';

export interface RelatedSubject {
  link: ExpenseLink;
  emoji: string;
  title: string;
  dayIndex: number | null;
  time: string | null;
  expenseCategory: ExpenseCategory | null;
  /** A meal's bill is rarely known up front, so its expense starts as an estimate. */
  prefersEstimate: boolean;
  /** Who the plan is for, so its expense starts split between them; `null` means everyone. */
  attendeeIds: string[] | null;
  checklistCategory: ChecklistCategory;
  /** Whether the plan shows the progress of its linked to-dos: an activity or dining event that hasn't started. */
  tracksTodos: boolean;
  /** Whether a missing booking to-do is worth a reminder: an activity that hasn't started; stays and rentals are booked when added. */
  tracksBooking: boolean;
}

const EVENT_EXPENSE_CATEGORIES: Record<EventType, ExpenseCategory | null> = {
  DINING: 'FOOD',
  TRAVEL: 'TRANSPORT',
  ACTIVITY: 'ACTIVITIES',
  FREE_TIME: null,
};

function getEventEmoji(event: TimelineEvent): string {
  const details = event.eventDetails;
  return event.eventType === 'TRAVEL' && details && 'transitType' in details
    ? TRANSIT_TYPE_EMOJIS[details.transitType]
    : EVENT_TYPE_EMOJIS[event.eventType];
}

export function getEventSubject(trip: TripSpace, event: TimelineEvent): RelatedSubject {
  const { dayIndex, startTime, startMs } = getEventTime(trip, event);
  const hasStarted = startMs !== null && Date.now() >= startMs;
  return {
    link: { kind: 'EVENT', id: event.id },
    emoji: getEventEmoji(event),
    title: event.title,
    dayIndex,
    time: startTime,
    expenseCategory: EVENT_EXPENSE_CATEGORIES[event.eventType],
    prefersEstimate: event.eventType === 'DINING',
    attendeeIds: event.attendeeTargetType === 'SPECIFIC_MEMBERS' ? event.assignedMemberIds : null,
    checklistCategory: event.eventType === 'TRAVEL' ? 'DOCUMENTS' : 'BOOKINGS',
    tracksTodos: TODO_TRACKED_EVENT_TYPES.includes(event.eventType) && !hasStarted,
    tracksBooking: BOOKING_TRACKED_EVENT_TYPES.includes(event.eventType) && !hasStarted,
  };
}

export function getStaySubject(trip: TripSpace, stay: Stay): RelatedSubject {
  return {
    link: { kind: 'STAY', id: stay.id },
    emoji: STAY_TYPE_EMOJIS[stay.stayType],
    title: stay.name,
    dayIndex: getStayTime(trip, stay).checkIn.dayIndex,
    time: getStayTime(trip, stay).checkIn.time,
    expenseCategory: 'LODGING',
    prefersEstimate: false,
    attendeeIds: null,
    checklistCategory: 'BOOKINGS',
    tracksTodos: false,
    tracksBooking: false,
  };
}

export function getRentalSubject(rental: Rental): RelatedSubject {
  return {
    link: { kind: 'RENTAL', id: rental.id },
    emoji: '🚗',
    title: rental.name,
    dayIndex: rental.pickupDayIndex,
    time: rental.pickupTime,
    expenseCategory: 'TRANSPORT',
    prefersEstimate: false,
    attendeeIds: null,
    checklistCategory: 'BOOKINGS',
    tracksTodos: false,
    tracksBooking: false,
  };
}

export const getExpenseLinkKey = ({ kind, id }: ExpenseLink) => `${kind}:${id}`;

export function getLinkableSubjects(
  trip: TripSpace,
  events: TimelineEvent[],
  stays: Stay[],
  rentals: Rental[],
): RelatedSubject[] {
  return [
    ...events.filter((event) => !event.isArchived).map((event) => getEventSubject(trip, event)),
    ...stays.map((stay) => getStaySubject(trip, stay)),
    ...rentals.map((rental) => getRentalSubject(rental)),
  ];
}

const FREE_OF_COST_TRANSIT = ['WALK', 'BIKE', 'SCOOTER'];

/** Free time and a walk, bike or scooter leg rarely cost anything, so saving one doesn't offer the follow-up. */
export function isWorthFollowUp(event: TimelineEvent): boolean {
  const details = event.eventDetails;
  return (
    event.eventType !== 'FREE_TIME' &&
    !(event.eventType === 'TRAVEL' && details && 'transitType' in details && FREE_OF_COST_TRANSIT.includes(details.transitType))
  );
}
