export type UserRole = 'ADMIN' | 'EDITOR' | 'COMMENTER' | 'VIEWER';
export type ExpenseTargetType =
  | 'EVERYONE_CURRENT'
  | 'EVERYONE_INCLUDING_FUTURE'
  | 'JUST_ME'
  | 'SPECIFIC_MEMBERS';
export type ExpenseStatus = 'PAID' | 'EXPECTED';
export type ChecklistCategory =
  | 'DOCUMENTS'
  | 'PACKING'
  | 'BOOKINGS'
  | 'LOGISTICS'
  | 'OTHER';

export interface TripMember {
  uid: string;
  role: UserRole;
  joinedAt: number;
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
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface TripJoinRequest {
  uid: string;
  tripId: string;
  requestedAt: number;
}

/** A Google Places (New) pick, resolved once at selection time and stored on the
 * event/stay doc. Only `placeId` is safe to keep indefinitely per Google's terms —
 * see src/apps/waypoint/utils/placesApi.ts for the refresh policy on the rest. */
export interface PlaceRef {
  placeId: string;
  mapsUrl: string;
  primaryType: string | null;
  photoUrl: string | null;
  photoRefreshedAt: number | null;
}

/** Metadata scraped from an attached URL (a booking/listing link, or a Google Maps
 * link) by the fetchLinkMetadata cloud function. See functions/src/apps/waypoint. */
export interface LinkPreview {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  fetchedAt: number;
}

export interface Stay {
  id: string;
  tripId: string;
  name: string;
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
  payerUid: string;
  status: ExpenseStatus;
  targetType: ExpenseTargetType;
  targetMemberIds: string[];
  splitAmounts: Record<string, number> | null;
  paidMemberStatus: Record<string, { isPaid: boolean; paidAt: number | null }>;
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
  assignedMemberIds: string[];
  changeHistory: EventChangeSnapshot[];
  place: PlaceRef | null;
  /** Only meaningful for DINING and ACTIVITY events; other types leave this null. */
  linkUrl: string | null;
  linkPreview: LinkPreview | null;
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
  assignedToUids: string[];
  isCompleted: boolean;
  markedCompletedByUid: string | null;
  markedCompletedAt: number | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
