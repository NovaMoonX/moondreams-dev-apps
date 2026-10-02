import type {
  ActivitySetting,
  AnnouncementSeverity,
  ChecklistCategory,
  EventAttendeeTargetType,
  EventFieldChange,
  EventLinkKind,
  EventType,
  ExpenseCategory,
  ExpenseSortBy,
  ExpenseTotalsView,
  MealType,
  StayType,
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

export const EVENT_TYPE_EMOJIS: Record<EventType, string> = {
  TRAVEL: '✈️',
  DINING: '🍽️',
  ACTIVITY: '🎒',
  FREE_TIME: '🌤️',
};

// Badge colors per event type — chosen so each stays legible in both themes
// and doesn't clash with its emoji's own colors (e.g. the sun in ☀️ against violet).
export const EVENT_TYPE_BADGE_CLASSES: Record<EventType, string> = {
  TRAVEL: 'bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-100',
  DINING: 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  ACTIVITY:
    'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  FREE_TIME:
    'bg-violet-200 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
};

export const ANNOUNCEMENT_SEVERITY_LABELS: Record<AnnouncementSeverity, string> = {
  INFO: 'Info',
  HEADS_UP: 'Heads up',
  URGENT: 'Urgent',
};

export const ANNOUNCEMENT_SEVERITY_BADGE_CLASSES: Record<AnnouncementSeverity, string> = {
  INFO: 'bg-sky-200 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
  HEADS_UP: 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  URGENT: 'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100',
};

export const EVENT_FIELD_LABELS: Record<EventFieldChange['field'], string> = {
  startAt: 'Start time',
  endAt: 'End time',
  startTime: 'Start time',
  endTime: 'End time',
  locationName: 'Location',
  dayIndex: 'Day',
  endDayIndex: 'End day',
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

export interface TransitFieldSpec {
  key: string;
  label: string;
  placeholder: string;
  /** Essential fields show up front; the rest wait behind "+ Add details". */
  essential: boolean;
}

const ROUTE_FIELDS: TransitFieldSpec[] = [
  { key: 'startLocation', label: 'Starting point', placeholder: 'Defaults to your previous event', essential: false },
  { key: 'endLocation', label: 'Destination', placeholder: 'Defaults to your next event', essential: false },
];

export const TRANSIT_FIELD_SPECS: Record<TransitType, TransitFieldSpec[]> = {
  FLIGHT: [
    { key: 'airline', label: 'Airline', placeholder: 'Delta', essential: true },
    { key: 'flightNumber', label: 'Flight number', placeholder: 'DL 482', essential: true },
    { key: 'confirmationCode', label: 'Confirmation code', placeholder: 'XK7P2Q', essential: true },
    { key: 'departureAirportCode', label: 'From (airport)', placeholder: 'JFK', essential: true },
    { key: 'arrivalAirportCode', label: 'To (airport)', placeholder: 'LAX', essential: true },
  ],
  TRAIN: [
    { key: 'operator', label: 'Operator', placeholder: 'Amtrak', essential: true },
    { key: 'trainNumber', label: 'Train number', placeholder: '171', essential: true },
    { key: 'confirmationCode', label: 'Confirmation code', placeholder: 'ABC123', essential: true },
    { key: 'departureStation', label: 'From (station)', placeholder: 'Penn Station', essential: false },
    { key: 'arrivalStation', label: 'To (station)', placeholder: 'Union Station', essential: false },
  ],
  FERRY: [
    { key: 'operator', label: 'Operator', placeholder: 'Washington State Ferries', essential: true },
    { key: 'confirmationCode', label: 'Confirmation code', placeholder: 'ABC123', essential: true },
    { key: 'departurePort', label: 'From (port)', placeholder: 'Seattle', essential: false },
    { key: 'arrivalPort', label: 'To (port)', placeholder: 'Bainbridge Island', essential: false },
  ],
  DRIVE: [
    { key: 'vehicleInfo', label: 'Vehicle', placeholder: 'Blue Subaru Outback', essential: false },
    ...ROUTE_FIELDS,
  ],
  WALK: ROUTE_FIELDS,
  BIKE: [
    { key: 'operator', label: 'Bike share or shop', placeholder: 'Citi Bike', essential: false },
    ...ROUTE_FIELDS,
  ],
  SCOOTER: [
    { key: 'operator', label: 'Scooter company', placeholder: 'Lime', essential: false },
    ...ROUTE_FIELDS,
  ],
  OTHER: [],
};

export const EVENT_LINK_KIND_LABELS: Record<EventLinkKind, string> = {
  WEBSITE: 'Website',
  RESERVATION: 'Reservation',
  MENU: 'Menu',
  BOOKING: 'Booking',
};

// Which kinds of link each event type offers; the first is the default.
export const EVENT_LINK_KINDS_BY_TYPE: Record<EventType, readonly EventLinkKind[]> = {
  TRAVEL: ['BOOKING', 'WEBSITE'],
  DINING: ['MENU', 'RESERVATION', 'WEBSITE'],
  ACTIVITY: ['BOOKING', 'WEBSITE'],
  FREE_TIME: [],
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

// 5-minute increments, 5-60 minutes before an event starts.
export const REMINDER_MINUTES_BEFORE_OPTIONS: readonly number[] = [
  5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60,
];

export const DEFAULT_REMINDER_MINUTES_BEFORE = 20;

export const CHECKLIST_CATEGORIES: readonly ChecklistCategory[] = [
  'DOCUMENTS',
  'PACKING',
  'BOOKINGS',
  'LOGISTICS',
  'OTHER',
];

export const CHECKLIST_CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  DOCUMENTS: 'Documents',
  PACKING: 'Packing',
  BOOKINGS: 'Bookings',
  LOGISTICS: 'Logistics',
  OTHER: 'Other',
};

// OTHER is the storage bucket for user-added categories (named by
// customCategoryLabel), so it's never offered as a preset choice.
export const PRESET_EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'FOOD',
  'TRANSPORT',
  'LODGING',
  'ACTIVITIES',
  'SHOPPING',
];

export const ADD_NEW_OPTION = '__add_new__';

export const EXPENSE_SORT_OPTIONS: { value: ExpenseSortBy; text: string }[] = [
  { value: 'day', text: 'Day' },
  { value: 'amount-desc', text: 'Amount (high to low)' },
  { value: 'amount-asc', text: 'Amount (low to high)' },
];

export const EXPENSE_TOTALS_VIEW_OPTIONS: { value: ExpenseTotalsView; label: string }[] = [
  { value: 'per-person', label: 'Per person' },
  { value: 'group', label: 'Group' },
];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  FOOD: 'Food',
  TRANSPORT: 'Transport',
  LODGING: 'Lodging',
  ACTIVITIES: 'Activities',
  SHOPPING: 'Shopping',
  OTHER: 'Other',
};

export const STAY_TYPES: readonly StayType[] = [
  'HOTEL',
  'RENTAL',
  'FRIEND_FAMILY',
  'OTHER',
];

export const STAY_TYPE_LABELS: Record<StayType, string> = {
  HOTEL: 'Hotel',
  RENTAL: 'Rental',
  FRIEND_FAMILY: 'Friend or family',
  OTHER: 'Other',
};

export const STAY_TYPE_OPTION_LABELS: Record<StayType, string> = {
  ...STAY_TYPE_LABELS,
  RENTAL: 'Rental (e.g., Airbnb)',
};

export const EVENT_ATTENDEE_TARGET_LABELS: Record<EventAttendeeTargetType, string> = {
  EVERYONE_CURRENT: 'Everyone present',
  EVERYONE_INCLUDING_FUTURE: 'Everyone, including future members',
  SPECIFIC_MEMBERS: 'Specific members',
};

export const TRIP_SECTION_TABS = [
  'overview',
  'members',
  'expenses',
  'stays',
  'checklist',
] as const;

export type TripSectionTab = (typeof TRIP_SECTION_TABS)[number];
