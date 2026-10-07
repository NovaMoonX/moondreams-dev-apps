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
import { EVENT_TYPE_EMOJIS, STAY_TYPE_EMOJIS, TRANSIT_TYPE_EMOJIS } from '@apps/waypoint/constants';
import { getEventTime, getStayTime } from '@apps/waypoint/utils/tripTime';

export interface RelatedSubject {
  link: ExpenseLink;
  emoji: string;
  title: string;
  dayIndex: number | null;
  time: string | null;
  expenseCategory: ExpenseCategory | null;
  checklistCategory: ChecklistCategory;
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
  const { dayIndex, startTime } = getEventTime(trip, event);
  return {
    link: { kind: 'EVENT', id: event.id },
    emoji: getEventEmoji(event),
    title: event.title,
    dayIndex,
    time: startTime,
    expenseCategory: EVENT_EXPENSE_CATEGORIES[event.eventType],
    checklistCategory: event.eventType === 'TRAVEL' ? 'DOCUMENTS' : 'BOOKINGS',
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
    checklistCategory: 'BOOKINGS',
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
    checklistCategory: 'BOOKINGS',
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
