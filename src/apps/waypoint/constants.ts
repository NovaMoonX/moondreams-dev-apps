import type {
  ActivitySetting,
  EventType,
  MealType,
  TransitType,
  UserRole,
} from '@apps/waypoint/types';

// The roles an Admin can assign when approving a join request — everything
// except ADMIN itself, which is only ever granted via a separate promotion.
export const ASSIGNABLE_MEMBER_ROLES: readonly UserRole[] = [
  'EDITOR',
  'COMMENTER',
  'VIEWER',
];

export const MEMBER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  COMMENTER: 'Commenter',
  VIEWER: 'Viewer',
};

export const MEMBER_ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN:
    'Full control over this trip, including editing details and managing other members.',
  EDITOR: 'Can edit trip details and itinerary items.',
  COMMENTER: 'Can comment on the trip but cannot edit details.',
  VIEWER: 'Can view the trip but cannot comment or edit.',
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  TRAVEL: 'Travel',
  DINING: 'Dining',
  ACTIVITY: 'Activity',
  FREE_TIME: 'Free time',
};

export const TRANSIT_TYPE_LABELS: Record<TransitType, string> = {
  FLIGHT: 'Flight',
  DRIVE: 'Drive',
  FERRY: 'Ferry',
  TRAIN: 'Train',
  WALK: 'Walk',
  BIKE: 'Bike',
  SCOOTER: 'Scooter',
  OTHER: 'Other',
};

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACK: 'Snack',
};

export const ACTIVITY_SETTING_LABELS: Record<ActivitySetting, string> = {
  INDOOR: 'Indoor',
  OUTDOOR: 'Outdoor',
};
