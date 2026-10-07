import type { EventFormValues } from '@apps/waypoint/components/EventFormModal';
import type {
  ChecklistCategory,
  EventType,
  ExpenseCategory,
  Rental,
  Stay,
  TripSpace,
} from '@apps/waypoint/types';
import { getEventTime, getStayTime } from '@apps/waypoint/utils/tripTime';

export interface RelatedSubject {
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

export function getEventSubject(trip: TripSpace, event: EventFormValues): RelatedSubject {
  return {
    title: event.title,
    dayIndex: getEventTime(trip, event).dayIndex,
    expenseCategory: EVENT_EXPENSE_CATEGORIES[event.eventType],
    checklistCategory: event.eventType === 'TRAVEL' ? 'DOCUMENTS' : 'BOOKINGS',
  };
}

type StayValues = Omit<Stay, 'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'>;

export function getStaySubject(trip: TripSpace, stay: StayValues): RelatedSubject {
  return {
    title: stay.name,
    dayIndex: getStayTime(trip, stay).checkIn.dayIndex,
    expenseCategory: 'LODGING',
    checklistCategory: 'BOOKINGS',
  };
}

export function getRentalSubject(rental: Pick<Rental, 'name' | 'pickupDayIndex'>): RelatedSubject {
  return {
    title: rental.name,
    dayIndex: rental.pickupDayIndex,
    expenseCategory: 'TRANSPORT',
    checklistCategory: 'BOOKINGS',
  };
}
