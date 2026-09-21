export type UserRole = 'ADMIN' | 'EDITOR' | 'COMMENTER' | 'VIEWER';

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
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface TripJoinRequest {
  uid: string;
  tripId: string;
  requestedAt: number;
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

export interface TravelEventDetails {
  transitType: TransitType;
}

export interface DiningEventDetails {
  mealType: MealType;
}

export interface ActivityEventDetails {
  settings: ActivitySetting[];
}

export interface FreeTimeEventDetails {}

export type EventDetails =
  | TravelEventDetails
  | DiningEventDetails
  | ActivityEventDetails
  | FreeTimeEventDetails;

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
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
