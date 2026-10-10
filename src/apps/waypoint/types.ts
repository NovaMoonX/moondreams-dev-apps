import type { LinkPreview } from '@/lib/linkMetadata/types';
import type { PlaceRef } from '@/lib/places/types';

export type UserRole = 'ADMIN' | 'EDITOR' | 'COMMENTER' | 'VIEWER';
export type ExpenseTargetType =
  | 'EVERYONE_CURRENT'
  | 'EVERYONE_INCLUDING_FUTURE'
  /** @deprecated Only older expenses carry it (shared with just the payer); the split editor now saves it as `SPECIFIC_MEMBERS`. */
  | 'JUST_ME'
  | 'SPECIFIC_MEMBERS';
export type ExpenseStatus = 'PAID' | 'EXPECTED';
export type ExpenseSortBy = 'day' | 'amount-desc' | 'amount-asc';
export type ExpenseTotalsView = 'per-person' | 'group' | 'me';
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

/** Where the trip is based, for the weather. Chosen from a city search; `null` until someone sets one. */
export interface TripCity {
  name: string;
  region: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
}

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
  /** Older documents lack it. */
  city: TripCity | null;
  /** Link keys (`getExpenseLinkKey`) of plans whose owner said no expense is needed. Older documents lack it. */
  noExpenseKeys: string[];
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

/** An admin's standing "yes" for an email address: whoever signs in with it can join the trip as `role`
 * without asking. Lives at `apps/waypoint/emailInvites/{tripId}_{email}`. */
export interface TripEmailInvite {
  tripId: string;
  /** Lower-cased. */
  email: string;
  role: Exclude<UserRole, 'ADMIN'>;
  invitedBy: string;
  invitedAt: number;
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

/** Money one member sent another ahead of an expected expense, so the Dues summary can offset it
 * once the expense is paid, or show it owed back if the plan falls through. */
export interface EarlyPayment {
  toUid: string;
  amount: number;
  paidAt: number;
  /** The recipient sent it back (or it was settled outside the app), so it no longer offsets anything. */
  isReturned: boolean;
  returnedAt: number | null;
}

export type ExpenseLinkKind = 'EVENT' | 'STAY' | 'RENTAL';

/** The event, stay or rental an expense is linked to. A target that was deleted since reads as no link. */
export interface ExpenseLink {
  kind: ExpenseLinkKind;
  id: string;
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
  /** Keyed by the member who paid early; older documents lack it. */
  earlyPayments: Record<string, EarlyPayment>;
  note: string | null;
  groupLabel: string | null;
  /** Older documents lack it. */
  linkedTo: ExpenseLink | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

/** Private to the person who wrote it: stored under their own uid, never shared with the trip's totals or dues. */
export interface PersonalExpense {
  id: string;
  tripId: string;
  dayIndex: number | null;
  title: string;
  amount: number;
  currency: string;
  status: ExpenseStatus;
  category: ExpenseCategory;
  customCategoryLabel: string | null;
  note: string | null;
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
export type IdeaType = 'RESTAURANT' | 'ACTIVITY';
export type TimeBlock = 'MORNING' | 'AFTERNOON' | 'EVENING';
export type EventStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
export type TripStatus = 'UPCOMING' | 'ACTIVE' | 'PAST';
export type EventAttendeeTargetType =
  | 'EVERYONE_CURRENT'
  | 'EVERYONE_INCLUDING_FUTURE'
  | 'SPECIFIC_MEMBERS';

export type EventLinkKind = 'WEBSITE' | 'RESERVATION' | 'MENU' | 'BOOKING';

export interface TransitDetailsBase {
  notes: string | null;
  /** A duration (ms), not a point in time. */
  estimatedTravelTimeMs: number | null;
}

/** `null` start/end means "from the previous event" / "to the next event". */
export interface PointToPointTransitDetails extends TransitDetailsBase {
  startLocation: string | null;
  endLocation: string | null;
}

export interface FlightTransitDetails extends TransitDetailsBase {
  airline: string | null;
  airlineIataCode: string | null;
  airlineIcaoCode: string | null;
  flightNumber: string | null;
  confirmationCode: string | null;
  departureAirportCode: string | null;
  arrivalAirportCode: string | null;
}

export interface DriveTransitDetails extends PointToPointTransitDetails {
  vehicleInfo: string | null;
}

export interface FerryTransitDetails extends TransitDetailsBase {
  operator: string | null;
  confirmationCode: string | null;
  departurePort: string | null;
  arrivalPort: string | null;
}

export interface TrainTransitDetails extends TransitDetailsBase {
  operator: string | null;
  trainNumber: string | null;
  confirmationCode: string | null;
  departureStation: string | null;
  arrivalStation: string | null;
}

export type WalkTransitDetails = PointToPointTransitDetails;

export interface BikeTransitDetails extends PointToPointTransitDetails {
  operator: string | null;
}

export interface ScooterTransitDetails extends PointToPointTransitDetails {
  operator: string | null;
}

export interface OtherTransitDetails extends TransitDetailsBase {
  customFields: Record<string, string> | null;
}

/** Which variant applies is read off the sibling `transitType`. */
export type TransitDetails =
  | FlightTransitDetails
  | DriveTransitDetails
  | FerryTransitDetails
  | TrainTransitDetails
  | WalkTransitDetails
  | BikeTransitDetails
  | ScooterTransitDetails
  | OtherTransitDetails;

export interface TravelEventDetails {
  transitType: TransitType;
  transitDetails: TransitDetails | null;
}

export interface DiningEventDetails {
  mealType: MealType;
  cuisines: string[];
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
    | 'arriveByTime'
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
  /** Zone override for this event's start (and its end, unless `endTimezone` says otherwise); `null` uses the trip's `timezone`. */
  timezone: string | null;
  /** Zone the end time is in when it differs from the start's, like a flight landing in another zone;
   * `null` means the same zone as the start. Absent on events saved before it existed. */
  endTimezone: string | null;
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
  /** "HH:mm" when the group wants to be there, on `dayIndex` and in the start's zone, strictly before `startTime`.
   * Dining and activities on `RELATIVE` trips only. Absent on events saved before it existed. */
  arriveByTime: string | null;
  /** Why they want to be early; only set alongside `arriveByTime`. */
  arriveByNote: string | null;
  changeHistory: EventChangeSnapshot[];
  place: PlaceRef | null;
  /** Not meaningful for FREE_TIME events, which leave this null. */
  linkUrl: string | null;
  linkPreview: LinkPreview | null;
  linkKind: EventLinkKind | null;
  groupLabel: string | null;
  /** Free-text stack name — several itineraries (groups or single events) of one event type shown together. */
  stackLabel: string | null;
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

/** Shared by ideas that happen once, on one day, at roughly one time of day. */
export interface SingleOccasionIdeaDetails {
  /** `dayIndex` values; empty means no day preference. */
  suggestedDays: number[];
  suggestedTimeBlocks: TimeBlock[];
}

export interface RestaurantIdeaDetails extends SingleOccasionIdeaDetails {
  cuisines: string[];
}

export interface ActivityIdeaDetails extends SingleOccasionIdeaDetails {
  settings: ActivitySetting[];
}

export type IdeaDetails = RestaurantIdeaDetails | ActivityIdeaDetails;

/** A place or thing a member suggests for the trip — anyone can post one until the trip starts
 * and anyone can vote on it at any time. */
export interface TripIdea {
  id: string;
  tripId: string;
  ideaType: IdeaType;
  title: string;
  notes: string | null;
  linkUrl: string | null;
  ideaDetails: IdeaDetails | null;
  addedByUid: string;
  voterUids: string[];
  /** The timeline event this idea became, once converted. */
  convertedToEntityId: string | null;
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
  /** The event, stay or rental this item is a to-do for ("book tickets"). Older documents lack it. */
  linkedTo: ExpenseLink | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
