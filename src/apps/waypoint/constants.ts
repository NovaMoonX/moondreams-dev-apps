import type { WeatherConditionId } from '@/lib/weather/weatherCodes';
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
  IdeaType,
  MealType,
  RentalType,
  StayType,
  TimeBlock,
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

// A travel event wears its transit type's color instead of the generic travel blue, kept
// clear of the dining, activity and free-time hues.
export const TRANSIT_TYPE_BADGE_CLASSES: Record<TransitType, string> = {
  FLIGHT: 'bg-sky-200 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
  DRIVE: 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100',
  FERRY: 'bg-cyan-200 text-cyan-900 dark:bg-cyan-900 dark:text-cyan-100',
  TRAIN: 'bg-indigo-200 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100',
  WALK: 'bg-lime-200 text-lime-900 dark:bg-lime-900 dark:text-lime-100',
  BIKE: 'bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100',
  SCOOTER: 'bg-pink-200 text-pink-900 dark:bg-pink-900 dark:text-pink-100',
  OTHER: 'bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100',
};

export const TRANSIT_TYPE_EMOJIS: Record<TransitType, string> = {
  FLIGHT: '✈️',
  DRIVE: '🚗',
  FERRY: '⛴️',
  TRAIN: '🚆',
  WALK: '🚶',
  BIKE: '🚲',
  SCOOTER: '🛴',
  OTHER: '🧭',
};

export interface TransitFieldSpec {
  key: string;
  label: string;
  placeholder: string;
  /** Essential fields show up front, in their section; the rest wait behind a chip. */
  essential: boolean;
  /** Where an essential field sits; defaults to the carrier section. */
  section?: 'route';
  /** Stored with the leg but never shown as an input of its own. */
  hidden?: boolean;
}

const START_FIELDS: TransitFieldSpec[] = [
  { key: 'startLocation', label: 'Starting from', placeholder: 'Defaults to your previous event', essential: false },
  { key: 'endLocation', label: 'Destination', placeholder: '', essential: false, hidden: true },
];

export const TRANSIT_FIELD_SPECS: Record<TransitType, TransitFieldSpec[]> = {
  FLIGHT: [
    { key: 'airline', label: 'Airline', placeholder: 'Delta Air Lines', essential: true },
    { key: 'airlineIataCode', label: 'Airline IATA code', placeholder: '', essential: false, hidden: true },
    { key: 'airlineIcaoCode', label: 'Airline ICAO code', placeholder: '', essential: false, hidden: true },
    { key: 'flightNumber', label: 'Flight number', placeholder: 'DL 482', essential: true },
    { key: 'confirmationCode', label: 'Confirmation code', placeholder: 'XK7P2Q', essential: true },
    { key: 'departureAirportCode', label: 'Departing airport', placeholder: 'JFK', essential: true, section: 'route' },
    { key: 'arrivalAirportCode', label: 'Arriving airport', placeholder: 'LAX', essential: true, section: 'route' },
  ],
  TRAIN: [
    { key: 'operator', label: 'Operator', placeholder: 'Amtrak', essential: true },
    { key: 'trainNumber', label: 'Train number', placeholder: '171', essential: true },
    { key: 'confirmationCode', label: 'Confirmation code', placeholder: 'ABC123', essential: true },
    { key: 'departureStation', label: 'Departing station', placeholder: '', essential: false, hidden: true },
    { key: 'arrivalStation', label: 'Arriving station', placeholder: 'Union Station', essential: true, section: 'route' },
  ],
  FERRY: [
    { key: 'operator', label: 'Operator', placeholder: 'Washington State Ferries', essential: true },
    { key: 'confirmationCode', label: 'Confirmation code', placeholder: 'ABC123', essential: true },
    { key: 'departurePort', label: 'Departing port', placeholder: '', essential: false, hidden: true },
    { key: 'arrivalPort', label: 'Arriving port', placeholder: 'Bainbridge Island', essential: true, section: 'route' },
  ],
  DRIVE: [
    { key: 'vehicleInfo', label: 'Vehicle', placeholder: 'Blue Subaru Outback', essential: false },
    ...START_FIELDS,
  ],
  WALK: START_FIELDS,
  BIKE: [
    { key: 'operator', label: 'Bike share or shop', placeholder: 'Citi Bike', essential: false },
    ...START_FIELDS,
  ],
  SCOOTER: [
    { key: 'operator', label: 'Scooter company', placeholder: 'Lime', essential: false },
    ...START_FIELDS,
  ],
  OTHER: [],
};

// What the event's location is for each kind of leg: where you head to catch it, or
// where a short trip ends. A flight takes its location from the departing airport instead.
export const TRANSIT_LOCATION_LABELS: Record<TransitType, string | null> = {
  FLIGHT: null,
  TRAIN: 'Departing station',
  FERRY: 'Departing port',
  DRIVE: 'Going to',
  WALK: 'Going to',
  BIKE: 'Going to',
  SCOOTER: 'Going to',
  OTHER: 'Where to navigate',
};

// The stored route field that mirrors the event's location, so the place is entered once.
export const TRANSIT_LOCATION_MIRROR_KEYS: Partial<Record<TransitType, string>> = {
  TRAIN: 'departureStation',
  FERRY: 'departurePort',
  DRIVE: 'endLocation',
  WALK: 'endLocation',
  BIKE: 'endLocation',
  SCOOTER: 'endLocation',
};

export const EVENT_LINK_KIND_LABELS: Record<EventLinkKind, string> = {
  WEBSITE: 'Website',
  RESERVATION: 'Reservation',
  MENU: 'Menu',
  BOOKING: 'Booking',
};

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

export const IDEA_TYPES: readonly IdeaType[] = ['RESTAURANT', 'ACTIVITY'];

export const IDEA_TYPE_LABELS: Record<IdeaType, string> = {
  RESTAURANT: 'Restaurant',
  ACTIVITY: 'Activity',
};

export const IDEA_TYPE_PLURAL_LABELS: Record<IdeaType, string> = {
  RESTAURANT: 'Restaurants',
  ACTIVITY: 'Activities',
};

export const IDEA_TYPE_EMOJIS: Record<IdeaType, string> = {
  RESTAURANT: '🍽️',
  ACTIVITY: '🎒',
};

export const IDEA_TYPE_CHIP_CLASSES: Record<IdeaType, string> = {
  RESTAURANT: EVENT_TYPE_BADGE_CLASSES.DINING,
  ACTIVITY: EVENT_TYPE_BADGE_CLASSES.ACTIVITY,
};

export const TIME_BLOCKS: readonly TimeBlock[] = ['MORNING', 'AFTERNOON', 'EVENING'];

export const TIME_BLOCK_LABELS: Record<TimeBlock, string> = {
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
  EVENING: 'Evening',
};

export const TIME_BLOCK_START_TIMES: Record<TimeBlock, string> = {
  MORNING: '09:00',
  AFTERNOON: '14:00',
  EVENING: '19:00',
};

// Reminders go out 5 minutes to 3 hours (airport time) before an event, in 5-minute steps.
export const REMINDER_STEP_MINUTES = 5;
export const MAX_REMINDER_MINUTES_BEFORE = 180;

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

export const RENTAL_TYPE_LABELS: Record<RentalType, string> = {
  CAR: 'Car rental',
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
  'rentals',
  'checklist',
  'ideas',
] as const;

export type TripSectionTab = (typeof TRIP_SECTION_TABS)[number];

export const WEATHER_BANNER_IMAGES: Record<WeatherConditionId, string | null> = {
  clear: '/by-app/waypoint/weather/clear.webp',
  'partly-sunny': '/by-app/waypoint/weather/partly-sunny.webp',
  overcast: '/by-app/waypoint/weather/overcast.webp',
  foggy: '/by-app/waypoint/weather/foggy.webp',
  drizzle: '/by-app/waypoint/weather/drizzle.webp',
  rain: '/by-app/waypoint/weather/rain.webp',
  'heavy-rain': '/by-app/waypoint/weather/heavy-rain.webp',
  snow: '/by-app/waypoint/weather/snow.webp',
  thunderstorms: '/by-app/waypoint/weather/thunderstorms.webp',
  unknown: null,
};
