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
export type ExpenseTotalsView = 'per-person' | 'group';
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
export type RentalType = 'CAR';

export interface TripMember {
  uid: string;
  role: UserRole;
  joinedAt: number;
}

export type TripDateShiftStatus = 'IDLE' | 'PENDING';

/** `ABSOLUTE` trips (created before relative times) store events and stays as real timestamps
 * and can't have their dates changed. `RELATIVE` trips store a day number + "HH:mm" instead, so
 * changing the trip's dates moves everything with it. A trip document with no `timeModel` is `ABSOLUTE`. */
export type TripTimeModel = 'RELATIVE' | 'ABSOLUTE';

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
  /** Absent on trips created before relative times — read it through `getTimeModel`. */
  timeModel: TripTimeModel;
  /** IANA zone the trip's wall-clock times default to; an event or stay can override it.
   * `null` on `ABSOLUTE` trips, which never had one. */
  timezone: string | null;
  /**
   * @deprecated The date-shift lock no longer exists; kept so trips that already carry the
   * field keep their history. New trips write `null`.
   */
  dateShiftStatus: TripDateShiftStatus | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface TripJoinRequest {
  uid: string;
  tripId: string;
  requestedAt: number;
}

export interface StayFieldChange {
  field:
    | 'checkInAt'
    | 'checkOutAt'
    | 'checkInDayIndex'
    | 'checkInTime'
    | 'checkOutDayIndex'
    | 'checkOutTime';
  previousValue: number | string | null;
  changedBy: string;
  changedAt: number;
}

export interface StayChangeSnapshot {
  changes: StayFieldChange[];
  latestChangedBy: string;
  latestChangedAt: number;
}

export interface Stay {
  id: string;
  tripId: string;
  name: string;
  stayType: StayType;
  address: string;
  latitude: number | null;
  longitude: number | null;
  /** @deprecated `ABSOLUTE` trips only (`null` on `RELATIVE` ones) — superseded by `checkInDayIndex` + `checkInTime`. */
  checkInAt: number | null;
  /** @deprecated `ABSOLUTE` trips only — superseded by `checkOutDayIndex` + `checkOutTime`. */
  checkOutAt: number | null;
  /** Zone override for this stay's times; `null` uses the trip's `timezone`. */
  checkInTimezone: string | null;
  /** @deprecated `ABSOLUTE` trips only — superseded by `plannedArrivalDayIndex` + `plannedArrivalTime`. */
  plannedArrivalAt: number | null;
  /** @deprecated `ABSOLUTE` trips only — superseded by `plannedDepartureDayIndex` + `plannedDepartureTime`. */
  plannedDepartureAt: number | null;
  /** `RELATIVE` trips: a trip day offset plus "HH:mm" for each of the four stay times. */
  checkInDayIndex: number | null;
  checkInTime: string | null;
  checkOutDayIndex: number | null;
  checkOutTime: string | null;
  plannedArrivalDayIndex: number | null;
  plannedArrivalTime: string | null;
  plannedDepartureDayIndex: number | null;
  plannedDepartureTime: string | null;
  confirmationCode: string | null;
  notes: string | null;
  place: PlaceRef | null;
  linkUrl: string | null;
  linkPreview: LinkPreview | null;
  changeHistory: StayChangeSnapshot[];
  /** uid -> ms timestamp of when that member last viewed this stay, used to flag
   * unseen post-start creations/edits in the "What's new" notifications panel. */
  seenBy: Record<string, number>;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

/** A vehicle (for now, a car) rented for part of the trip. Its pickup and return are trip-relative
 * times on every trip, absolute-model ones included, since those trips' dates never move. */
export interface Rental {
  id: string;
  tripId: string;
  rentalType: RentalType;
  /** The rental company, e.g. "Hertz". */
  name: string;
  /** Free-text vehicle, e.g. "Toyota RAV4 or similar". */
  vehicle: string | null;
  pickupAddress: string;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  pickupPlace: PlaceRef | null;
  /** `null` means the car goes back to the pickup location. */
  returnAddress: string | null;
  returnLatitude: number | null;
  returnLongitude: number | null;
  returnPlace: PlaceRef | null;
  pickupDayIndex: number;
  pickupTime: string;
  returnDayIndex: number;
  returnTime: string;
  /** Zone override for this rental's times; `null` uses the trip's `timezone`. */
  timezone: string | null;
  confirmationCode: string | null;
  notes: string | null;
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
  /** When true, the amount fields are per person and scale by the split's headcount. */
  isPerPerson: boolean;
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
  field:
    | 'startAt'
    | 'endAt'
    | 'startTime'
    | 'endTime'
    | 'locationName'
    | 'dayIndex'
    | 'endDayIndex';
  previousValue: number | string | null;
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
  /** `null` means "no specific day" (`RELATIVE` trips only). `dayIndex` and `endDayIndex` are both set or both null. */
  dayIndex: number | null;
  endDayIndex: number | null;
  title: string;
  /** @deprecated `ABSOLUTE` trips only (`null` on `RELATIVE` ones) — superseded by `dayIndex` + `startTime`. */
  startAt: number | null;
  /** @deprecated `ABSOLUTE` trips only — superseded by `endDayIndex` + `endTime`. */
  endAt: number | null;
  /** "HH:mm" wall-clock time on `dayIndex`, floating — shown the same to every viewer. `RELATIVE` trips only. */
  startTime: string | null;
  endTime: string | null;
  /** Zone override for this event's times; `null` uses the trip's `timezone`. */
  timezone: string | null;
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
  /** Superseded by an accepted suggestion, or manually archived once the trip is live —
   * excluded from the default Timeline view. */
  isArchived: boolean;
  /** Who archived this event and when — cleared back to `null` on unarchive, so these only
   * ever describe the current archived state, not archive history. */
  archivedBy: string | null;
  archivedAt: number | null;
  /** uid -> ms timestamp of when that member last viewed this event, used to flag
   * unseen post-start creations/edits in the Overview section. */
  seenBy: Record<string, number>;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

/** A proposed replacement for an existing timeline event — any member can propose or upvote
 * one; approving one (admin-only) archives the source event and creates a new event from
 * these fields. Everything not overridden here (event type, attendees, reminders, notes) is
 * carried over from the source event, since this models "the same event, moved/renamed." */
export interface EventSuggestion {
  id: string;
  tripId: string;
  eventId: string;
  suggestedTitle: string;
  /** @deprecated `ABSOLUTE` trips only (`null` on `RELATIVE` ones) — superseded by `suggestedDayIndex` + `suggestedStartTime`. */
  suggestedStartAt: number | null;
  /** @deprecated `ABSOLUTE` trips only — superseded by `suggestedEndTime`. */
  suggestedEndAt: number | null;
  /** `RELATIVE` trips: the suggested day and "HH:mm" times (the end is on the same day). */
  suggestedDayIndex: number | null;
  suggestedStartTime: string | null;
  suggestedEndTime: string | null;
  suggestedLocationName: string | null;
  suggestedAddress: string | null;
  suggestedLatitude: number | null;
  suggestedLongitude: number | null;
  suggestedPlace: PlaceRef | null;
  note: string | null;
  upvotedBy: string[];
  createdBy: string;
  createdAt: number;
}

export type AnnouncementSeverity = 'INFO' | 'HEADS_UP' | 'URGENT';

export interface Announcement {
  id: string;
  tripId: string;
  severity: AnnouncementSeverity;
  title: string;
  body: string;
  expiresAt: number | null;
  /** uid -> ms timestamp of when that member dismissed this announcement for themselves —
   * it stays live for everyone else until it expires or an admin deletes it. */
  dismissedBy: Record<string, number>;
  createdBy: string;
  createdAt: number;
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
