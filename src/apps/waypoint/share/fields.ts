import type { ShareDecision } from '@/lib/connections/fieldDecisions';
import type {
  TripMember,
  TripCity,
  TripSpace,
  TripJoinRequest,
  TripEmailInvite,
  StayFieldChange,
  StayChangeSnapshot,
  Stay,
  Rental,
  EarlyPayment,
  ExpenseLink,
  RepaidLogEntry,
  RepaidStatus,
  TripExpense,
  PersonalExpense,
  TransitDetailsBase,
  PointToPointTransitDetails,
  FlightTransitDetails,
  DriveTransitDetails,
  FerryTransitDetails,
  TrainTransitDetails,
  BikeTransitDetails,
  ScooterTransitDetails,
  OtherTransitDetails,
  TravelEventDetails,
  DiningEventDetails,
  ActivityEventDetails,
  EventFieldChange,
  EventChangeSnapshot,
  TimelineEvent,
  EventSuggestion,
  Announcement,
  SingleOccasionIdeaDetails,
  RestaurantIdeaDetails,
  ActivityIdeaDetails,
  TripIdea,
  ChecklistItem,
} from '@apps/waypoint/types';

const TRIP_MEMBER_FIELDS = {
  uid: 'notUseful',
  role: 'notUseful',
  joinedAt: 'notUseful',
} satisfies Record<keyof TripMember, ShareDecision>;

const TRIP_CITY_FIELDS = {
  name: 'shared',
  region: 'notUseful',
  country: 'notUseful',
  latitude: 'notUseful',
  longitude: 'notUseful',
} satisfies Record<keyof TripCity, ShareDecision>;

const TRIP_SPACE_FIELDS = {
  id: 'notUseful',
  title: 'shared',
  coverImageUrl: 'notUseful',
  startDate: 'shared',
  endDate: 'shared',
  defaultCurrency: 'shared',
  isArchived: 'filter',
  members: 'filter',
  inviteCode: 'never',
  sharedAlbumUrl: 'never',
  sharedAlbumSetByUid: 'never',
  sharedAlbumSetAt: 'never',
  timeModel: 'shared',
  timezone: 'shared',
  city: 'shared',
  noExpenseKeys: 'notUseful',
  watchedMeals: 'notUseful',
  dateShiftStatus: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof TripSpace, ShareDecision>;

const TRIP_JOIN_REQUEST_FIELDS = {
  uid: 'notUseful',
  tripId: 'notUseful',
  requestedAt: 'notUseful',
} satisfies Record<keyof TripJoinRequest, ShareDecision>;

const TRIP_EMAIL_INVITE_FIELDS = {
  tripId: 'never',
  email: 'never',
  role: 'never',
  invitedBy: 'never',
  invitedAt: 'never',
} satisfies Record<keyof TripEmailInvite, ShareDecision>;

const STAY_FIELD_CHANGE_FIELDS = {
  field: 'notUseful',
  previousValue: 'notUseful',
  changedBy: 'notUseful',
  changedAt: 'notUseful',
} satisfies Record<keyof StayFieldChange, ShareDecision>;

const STAY_CHANGE_SNAPSHOT_FIELDS = {
  changes: 'notUseful',
  latestChangedBy: 'notUseful',
  latestChangedAt: 'notUseful',
} satisfies Record<keyof StayChangeSnapshot, ShareDecision>;

const STAY_FIELDS = {
  id: 'notUseful',
  tripId: 'notUseful',
  name: 'shared',
  stayType: 'notUseful',
  address: 'shared',
  latitude: 'notUseful',
  longitude: 'notUseful',
  checkInAt: 'shared',
  checkOutAt: 'shared',
  checkInTimezone: 'shared',
  plannedArrivalAt: 'notUseful',
  plannedDepartureAt: 'notUseful',
  checkInDayIndex: 'shared',
  checkInTime: 'shared',
  checkOutDayIndex: 'shared',
  checkOutTime: 'shared',
  plannedArrivalDayIndex: 'notUseful',
  plannedArrivalTime: 'notUseful',
  plannedDepartureDayIndex: 'notUseful',
  plannedDepartureTime: 'notUseful',
  confirmationCode: 'never',
  notes: 'never',
  place: 'notUseful',
  linkUrl: 'notUseful',
  linkPreview: 'notUseful',
  changeHistory: 'notUseful',
  seenBy: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof Stay, ShareDecision>;

const RENTAL_FIELDS = {
  id: 'notUseful',
  tripId: 'notUseful',
  rentalType: 'notUseful',
  name: 'shared',
  vehicle: 'notUseful',
  pickupAddress: 'shared',
  pickupLatitude: 'notUseful',
  pickupLongitude: 'notUseful',
  pickupPlace: 'notUseful',
  returnAddress: 'notUseful',
  returnLatitude: 'notUseful',
  returnLongitude: 'notUseful',
  returnPlace: 'notUseful',
  pickupDayIndex: 'shared',
  pickupTime: 'shared',
  returnDayIndex: 'shared',
  returnTime: 'shared',
  timezone: 'shared',
  confirmationCode: 'never',
  notes: 'never',
  linkUrl: 'notUseful',
  linkPreview: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof Rental, ShareDecision>;

const EARLY_PAYMENT_FIELDS = {
  toUid: 'notUseful',
  amount: 'notUseful',
  paidAt: 'notUseful',
  isReturned: 'notUseful',
  returnedAt: 'notUseful',
} satisfies Record<keyof EarlyPayment, ShareDecision>;

const EXPENSE_LINK_FIELDS = {
  kind: 'notUseful',
  id: 'notUseful',
} satisfies Record<keyof ExpenseLink, ShareDecision>;

const REPAID_LOG_ENTRY_FIELDS = {
  isPaid: 'notUseful',
  byUid: 'notUseful',
  at: 'notUseful',
  isReset: 'notUseful',
} satisfies Record<keyof RepaidLogEntry, ShareDecision>;

const REPAID_STATUS_FIELDS = {
  isPaid: 'notUseful',
  paidAt: 'notUseful',
  markedByUid: 'notUseful',
  log: 'notUseful',
} satisfies Record<keyof RepaidStatus, ShareDecision>;

const TRIP_EXPENSE_FIELDS = {
  id: 'notUseful',
  tripId: 'notUseful',
  dayIndex: 'notUseful',
  title: 'never',
  amount: 'filter',
  amountMin: 'filter',
  amountMax: 'filter',
  paidAmount: 'filter',
  currency: 'notUseful',
  isPerPerson: 'filter',
  payerUid: 'filter',
  status: 'filter',
  category: 'notUseful',
  customCategoryLabel: 'notUseful',
  targetType: 'filter',
  targetMemberIds: 'filter',
  splitAmounts: 'filter',
  paidMemberStatus: 'filter',
  earlyPayments: 'filter',
  note: 'never',
  groupLabel: 'never',
  linkedTo: 'never',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'notUseful',
} satisfies Record<keyof TripExpense, ShareDecision>;

const PERSONAL_EXPENSE_FIELDS = {
  id: 'never',
  tripId: 'never',
  dayIndex: 'never',
  title: 'never',
  amount: 'never',
  currency: 'never',
  status: 'never',
  category: 'never',
  customCategoryLabel: 'never',
  note: 'never',
  createdAt: 'never',
  lastEditedAt: 'never',
} satisfies Record<keyof PersonalExpense, ShareDecision>;

const TRANSIT_DETAILS_BASE_FIELDS = {
  notes: 'never',
  estimatedTravelTimeMs: 'notUseful',
} satisfies Record<keyof TransitDetailsBase, ShareDecision>;

const POINT_TO_POINT_TRANSIT_DETAILS_FIELDS = {
  notes: 'never',
  estimatedTravelTimeMs: 'notUseful',
  startLocation: 'notUseful',
  endLocation: 'notUseful',
} satisfies Record<keyof PointToPointTransitDetails, ShareDecision>;

const FLIGHT_TRANSIT_DETAILS_FIELDS = {
  notes: 'never',
  estimatedTravelTimeMs: 'notUseful',
  airline: 'notUseful',
  airlineIataCode: 'notUseful',
  airlineIcaoCode: 'notUseful',
  flightNumber: 'notUseful',
  confirmationCode: 'never',
  departureAirportCode: 'notUseful',
  arrivalAirportCode: 'notUseful',
} satisfies Record<keyof FlightTransitDetails, ShareDecision>;

const DRIVE_TRANSIT_DETAILS_FIELDS = {
  notes: 'never',
  estimatedTravelTimeMs: 'notUseful',
  startLocation: 'notUseful',
  endLocation: 'notUseful',
  vehicleInfo: 'notUseful',
} satisfies Record<keyof DriveTransitDetails, ShareDecision>;

const FERRY_TRANSIT_DETAILS_FIELDS = {
  notes: 'never',
  estimatedTravelTimeMs: 'notUseful',
  operator: 'notUseful',
  confirmationCode: 'never',
  departurePort: 'notUseful',
  arrivalPort: 'notUseful',
} satisfies Record<keyof FerryTransitDetails, ShareDecision>;

const TRAIN_TRANSIT_DETAILS_FIELDS = {
  notes: 'never',
  estimatedTravelTimeMs: 'notUseful',
  operator: 'notUseful',
  trainNumber: 'notUseful',
  confirmationCode: 'never',
  departureStation: 'notUseful',
  arrivalStation: 'notUseful',
} satisfies Record<keyof TrainTransitDetails, ShareDecision>;

const BIKE_TRANSIT_DETAILS_FIELDS = {
  notes: 'never',
  estimatedTravelTimeMs: 'notUseful',
  startLocation: 'notUseful',
  endLocation: 'notUseful',
  operator: 'notUseful',
} satisfies Record<keyof BikeTransitDetails, ShareDecision>;

const SCOOTER_TRANSIT_DETAILS_FIELDS = {
  notes: 'never',
  estimatedTravelTimeMs: 'notUseful',
  startLocation: 'notUseful',
  endLocation: 'notUseful',
  operator: 'notUseful',
} satisfies Record<keyof ScooterTransitDetails, ShareDecision>;

const OTHER_TRANSIT_DETAILS_FIELDS = {
  notes: 'never',
  estimatedTravelTimeMs: 'notUseful',
  customFields: 'notUseful',
} satisfies Record<keyof OtherTransitDetails, ShareDecision>;

const TRAVEL_EVENT_DETAILS_FIELDS = {
  transitType: 'shared',
  transitDetails: 'never',
} satisfies Record<keyof TravelEventDetails, ShareDecision>;

const DINING_EVENT_DETAILS_FIELDS = {
  mealType: 'notUseful',
  cuisines: 'notUseful',
} satisfies Record<keyof DiningEventDetails, ShareDecision>;

const ACTIVITY_EVENT_DETAILS_FIELDS = {
  settings: 'notUseful',
} satisfies Record<keyof ActivityEventDetails, ShareDecision>;

const EVENT_FIELD_CHANGE_FIELDS = {
  field: 'notUseful',
  previousValue: 'notUseful',
  changedBy: 'notUseful',
  changedAt: 'notUseful',
} satisfies Record<keyof EventFieldChange, ShareDecision>;

const EVENT_CHANGE_SNAPSHOT_FIELDS = {
  changes: 'notUseful',
  latestChangedBy: 'notUseful',
  latestChangedAt: 'notUseful',
} satisfies Record<keyof EventChangeSnapshot, ShareDecision>;

const TIMELINE_EVENT_FIELDS = {
  id: 'notUseful',
  tripId: 'notUseful',
  eventType: 'shared',
  customTypeLabel: 'shared',
  dayIndex: 'shared',
  endDayIndex: 'shared',
  title: 'shared',
  startAt: 'shared',
  endAt: 'shared',
  startTime: 'shared',
  endTime: 'shared',
  timezone: 'shared',
  endTimezone: 'shared',
  locationName: 'shared',
  address: 'notUseful',
  latitude: 'notUseful',
  longitude: 'notUseful',
  eventDetails: 'shared',
  notes: 'never',
  attendeeTargetType: 'filter',
  assignedMemberIds: 'filter',
  venueOpenTime: 'notUseful',
  venueCloseTime: 'notUseful',
  arriveByTime: 'notUseful',
  arriveByNote: 'notUseful',
  changeHistory: 'notUseful',
  place: 'notUseful',
  linkUrl: 'notUseful',
  linkPreview: 'notUseful',
  linkKind: 'notUseful',
  groupLabel: 'notUseful',
  stackLabel: 'notUseful',
  reminderMinutesBefore: 'notUseful',
  reminderEnabled: 'notUseful',
  reminderId: 'notUseful',
  isArchived: 'filter',
  archivedBy: 'notUseful',
  archivedAt: 'notUseful',
  seenBy: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof TimelineEvent, ShareDecision>;

const EVENT_SUGGESTION_FIELDS = {
  id: 'never',
  tripId: 'never',
  eventId: 'never',
  suggestedTitle: 'never',
  suggestedStartAt: 'never',
  suggestedEndAt: 'never',
  suggestedDayIndex: 'never',
  suggestedStartTime: 'never',
  suggestedEndTime: 'never',
  suggestedLocationName: 'never',
  suggestedAddress: 'never',
  suggestedLatitude: 'never',
  suggestedLongitude: 'never',
  suggestedPlace: 'never',
  note: 'never',
  upvotedBy: 'never',
  createdBy: 'never',
  createdAt: 'never',
} satisfies Record<keyof EventSuggestion, ShareDecision>;

const ANNOUNCEMENT_FIELDS = {
  id: 'notUseful',
  tripId: 'notUseful',
  severity: 'notUseful',
  title: 'notUseful',
  body: 'notUseful',
  expiresAt: 'notUseful',
  dismissedBy: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
} satisfies Record<keyof Announcement, ShareDecision>;

const SINGLE_OCCASION_IDEA_DETAILS_FIELDS = {
  suggestedDays: 'notUseful',
  suggestedTimeBlocks: 'notUseful',
} satisfies Record<keyof SingleOccasionIdeaDetails, ShareDecision>;

const RESTAURANT_IDEA_DETAILS_FIELDS = {
  suggestedDays: 'notUseful',
  suggestedTimeBlocks: 'notUseful',
  cuisines: 'notUseful',
} satisfies Record<keyof RestaurantIdeaDetails, ShareDecision>;

const ACTIVITY_IDEA_DETAILS_FIELDS = {
  suggestedDays: 'notUseful',
  suggestedTimeBlocks: 'notUseful',
  settings: 'notUseful',
} satisfies Record<keyof ActivityIdeaDetails, ShareDecision>;

const TRIP_IDEA_FIELDS = {
  id: 'notUseful',
  tripId: 'notUseful',
  ideaType: 'notUseful',
  title: 'notUseful',
  notes: 'never',
  linkUrl: 'notUseful',
  ideaDetails: 'notUseful',
  addedByUid: 'notUseful',
  voterUids: 'notUseful',
  convertedToEntityId: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'notUseful',
} satisfies Record<keyof TripIdea, ShareDecision>;

const CHECKLIST_ITEM_FIELDS = {
  id: 'notUseful',
  tripId: 'filter',
  title: 'shared',
  category: 'notUseful',
  customCategoryLabel: 'notUseful',
  note: 'never',
  completeByDayIndex: 'shared',
  assignedToUids: 'filter',
  isCompleted: 'shared',
  markedCompletedByUid: 'notUseful',
  markedCompletedAt: 'notUseful',
  linkedTo: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof ChecklistItem, ShareDecision>;

/** What waypoint lets Helm read, per stored field; an added, removed or renamed field fails the typecheck until it is decided here. */
export const SHARE_FIELDS = {
  TripMember: TRIP_MEMBER_FIELDS,
  TripCity: TRIP_CITY_FIELDS,
  TripSpace: TRIP_SPACE_FIELDS,
  TripJoinRequest: TRIP_JOIN_REQUEST_FIELDS,
  TripEmailInvite: TRIP_EMAIL_INVITE_FIELDS,
  StayFieldChange: STAY_FIELD_CHANGE_FIELDS,
  StayChangeSnapshot: STAY_CHANGE_SNAPSHOT_FIELDS,
  Stay: STAY_FIELDS,
  Rental: RENTAL_FIELDS,
  EarlyPayment: EARLY_PAYMENT_FIELDS,
  ExpenseLink: EXPENSE_LINK_FIELDS,
  RepaidLogEntry: REPAID_LOG_ENTRY_FIELDS,
  RepaidStatus: REPAID_STATUS_FIELDS,
  TripExpense: TRIP_EXPENSE_FIELDS,
  PersonalExpense: PERSONAL_EXPENSE_FIELDS,
  TransitDetailsBase: TRANSIT_DETAILS_BASE_FIELDS,
  PointToPointTransitDetails: POINT_TO_POINT_TRANSIT_DETAILS_FIELDS,
  FlightTransitDetails: FLIGHT_TRANSIT_DETAILS_FIELDS,
  DriveTransitDetails: DRIVE_TRANSIT_DETAILS_FIELDS,
  FerryTransitDetails: FERRY_TRANSIT_DETAILS_FIELDS,
  TrainTransitDetails: TRAIN_TRANSIT_DETAILS_FIELDS,
  BikeTransitDetails: BIKE_TRANSIT_DETAILS_FIELDS,
  ScooterTransitDetails: SCOOTER_TRANSIT_DETAILS_FIELDS,
  OtherTransitDetails: OTHER_TRANSIT_DETAILS_FIELDS,
  TravelEventDetails: TRAVEL_EVENT_DETAILS_FIELDS,
  DiningEventDetails: DINING_EVENT_DETAILS_FIELDS,
  ActivityEventDetails: ACTIVITY_EVENT_DETAILS_FIELDS,
  EventFieldChange: EVENT_FIELD_CHANGE_FIELDS,
  EventChangeSnapshot: EVENT_CHANGE_SNAPSHOT_FIELDS,
  TimelineEvent: TIMELINE_EVENT_FIELDS,
  EventSuggestion: EVENT_SUGGESTION_FIELDS,
  Announcement: ANNOUNCEMENT_FIELDS,
  SingleOccasionIdeaDetails: SINGLE_OCCASION_IDEA_DETAILS_FIELDS,
  RestaurantIdeaDetails: RESTAURANT_IDEA_DETAILS_FIELDS,
  ActivityIdeaDetails: ACTIVITY_IDEA_DETAILS_FIELDS,
  TripIdea: TRIP_IDEA_FIELDS,
  ChecklistItem: CHECKLIST_ITEM_FIELDS,
};

/** Exported types that are not stored, so have no fields to decide. */
export const NOT_STORED: Record<string, string> = {};
