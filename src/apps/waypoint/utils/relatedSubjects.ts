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
import { EVENT_TYPE_EMOJIS, STAY_TYPE_EMOJIS } from '@apps/waypoint/constants';
import { getEventTime, getStayTime } from '@apps/waypoint/utils/tripTime';

export interface RelatedSubject {
  link: ExpenseLink;
  emoji: string;
  title: string;
  dayIndex: number | null;
  expenseCategory: ExpenseCategory | null;
  checklistCategory: ChecklistCategory;
}

const EVENT_EXPENSE_CATEGORIES: Record<EventType, ExpenseCategory | null> = {
  DINING: 'FOOD',
  TRAVEL: 'TRANSPORT',
  ACTIVITY: 'ACTIVITIES',
  FREE_TIME: null,
};

export function getEventSubject(trip: TripSpace, event: TimelineEvent): RelatedSubject {
  return {
    link: { kind: 'EVENT', id: event.id },
    emoji: EVENT_TYPE_EMOJIS[event.eventType],
    title: event.title,
    dayIndex: getEventTime(trip, event).dayIndex,
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
