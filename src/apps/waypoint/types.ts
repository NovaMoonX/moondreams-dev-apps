import type { LinkPreview } from '@/lib/linkMetadata/types';
import type { PlaceRef } from '@/lib/places/types';

export type UserRole = 'ADMIN' | 'EDITOR' | 'COMMENTER' | 'VIEWER';
export type ExpenseTargetType =
  | 'EVERYONE_CURRENT'
  | 'EVERYONE_INCLUDING_FUTURE'
  | 'JUST_ME'
  | 'SPECIFIC_MEMBERS';
export type ExpenseStatus = 'PAID' | 'EXPECTED';
export type ExpenseSortBy = 'day' | 'amount-desc' | 'amount-asc';
export type ExpenseCategory =
  | 'FOOD'
  | 'TRANSPORT'
  | 'LODGING'
  | 'ACTIVITIES'
  | 'SHOPPING'
  | 'OTHER';
export type ChecklistCategory =
  | 'DOCUMENTS'
  | 'PACKING'
  | 'BOOKINGS'
  | 'LOGISTICS'
  | 'OTHER';
export type StayType = 'HOTEL' | 'RENTAL' | 'FRIEND_FAMILY' | 'OTHER';

export interface TripMember {
  uid: string;
  role: UserRole;
  joinedAt: number;
}

export type TripDateShiftStatus = 'IDLE' | 'PENDING';

export interface TripSpace {
  id: string;
  title: string;
  coverImageUrl: string | null;
  startDate: number;
  endDate: number;
  defaultCurrency: string | null;
  isArchived: boolean;
  members: Record<string, TripMember>;
  inviteCode: string | null;
  sharedAlbumUrl: string | null;
  sharedAlbumSetByUid: string | null;
  sharedAlbumSetAt: number | null;
  /** `PENDING` while a Cloud Function is re-dating every event/stay/expense/checklist
   * item after a date change — the trip and everything under it is read-only until
   * it goes back to `IDLE`, so two shifts (or a shift and an edit) can't race. */
  dateShiftStatus: TripDateShiftStatus;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface TripJoinRequest {
  uid: string;
  tripId: string;
  requestedAt: number;
}

export interface Stay {
  id: string;
  tripId: string;
  name: string;
  stayType: StayType;
  address: string;
  latitude: number | null;
  longitude: number | null;
  checkInAt: number;
  checkOutAt: number;
  checkInTimezone: string | null;
  plannedArrivalAt: number;
  plannedDepartureAt: number;
  confirmationCode: string | null;
  notes: string | null;
  place: PlaceRef | null;
  linkUrl: string | null;
  linkPreview: LinkPreview | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface TripExpense {
  id: string;
  tripId: string;
  dayIndex: number | null;
  title: string;
  amount: number | null;
  amountMin: number | null;
  amountMax: number | null;
  paidAmount: number | null;
  currency: string;
  /** Who fronted the money. `null` means "paid by each person" — no single
   * payer, so nobody is owed anything for this expense. */
  payerUid: string | null;
  status: ExpenseStatus;
  category: ExpenseCategory;
  customCategoryLabel: string | null;
  targetType: ExpenseTargetType;
  targetMemberIds: string[];
  splitAmounts: Record<string, number> | null;
  paidMemberStatus: Record<string, { isPaid: boolean; paidAt: number | null }>;
  note: string | null;
  groupLabel: string | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export type EventType = 'TRAVEL' | 'DINING' | 'ACTIVITY' | 'FREE_TIME';
export type TransitType =
  | 'FLIGHT'
  | 'DRIVE'
  | 'FERRY'
  | 'TRAIN'
  | 'WALK'
  | 'BIKE'
  | 'SCOOTER'
  | 'OTHER';
export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
export type ActivitySetting = 'INDOOR' | 'OUTDOOR';
export type EventStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
export type TripStatus = 'UPCOMING' | 'ACTIVE' | 'PAST';
export type EventAttendeeTargetType =
  | 'EVERYONE_CURRENT'
  | 'EVERYONE_INCLUDING_FUTURE'
  | 'SPECIFIC_MEMBERS';

export interface TravelEventDetails {
  transitType: TransitType;
}

export interface DiningEventDetails {
  mealType: MealType;
}

export interface ActivityEventDetails {
  settings: ActivitySetting[];
}

export type FreeTimeEventDetails = Record<string, never>;

export type EventDetails =
  | TravelEventDetails
  | DiningEventDetails
  | ActivityEventDetails
  | FreeTimeEventDetails;

export interface EventFieldChange {
  field: 'startAt' | 'endAt' | 'locationName' | 'dayIndex' | 'endDayIndex';
  previousValue: number | string;
  changedBy: string;
  changedAt: number;
}

export interface EventChangeSnapshot {
  changes: EventFieldChange[];
  latestChangedBy: string;
  latestChangedAt: number;
}

export interface TimelineEvent {
  id: string;
  tripId: string;
  eventType: EventType;
  dayIndex: number;
  endDayIndex: number;
  title: string;
  startAt: number;
  endAt: number | null;
  locationName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  eventDetails: EventDetails | null;
  notes: string | null;
  /** Who this event is for. `SPECIFIC_MEMBERS`/`EVERYONE_CURRENT` snapshot their
   * members into `assignedMemberIds`; `EVERYONE_INCLUDING_FUTURE` resolves dynamically
   * against the trip's current members instead. */
  attendeeTargetType: EventAttendeeTargetType;
  assignedMemberIds: string[];
  /** Venue open/close time for the event's day, as "HH:mm" — e.g. a museum's hours. */
  venueOpenTime: string | null;
  venueCloseTime: string | null;
  changeHistory: EventChangeSnapshot[];
  place: PlaceRef | null;
  /** Only meaningful for DINING and ACTIVITY events; other types leave this null. */
  linkUrl: string | null;
  linkPreview: LinkPreview | null;
  /** Minutes before `startAt` to send a reminder. Always a real value (defaults to
   * `DEFAULT_REMINDER_MINUTES_BEFORE`) — an event with no reminder configured yet
   * reads as "default lead time, enabled" rather than "no reminder." */
  reminderMinutesBefore: number;
  /** Whether the reminder is active; `false` disables it without losing the chosen lead time. */
  reminderEnabled: boolean;
  /** Id of the currently-scheduled `reminders/{id}` doc, or `null` if none is scheduled. */
  reminderId: string | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface ChecklistItem {
  id: string;
  tripId: string;
  title: string;
  category: ChecklistCategory;
  customCategoryLabel: string | null;
  note: string | null;
  completeByDayIndex: number | null;
  assignedToUids: string[];
  isCompleted: boolean;
  markedCompletedByUid: string | null;
  markedCompletedAt: number | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
