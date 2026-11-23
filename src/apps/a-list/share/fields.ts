import type { ShareDecision } from '@/lib/connections/fieldDecisions';
import type {
  MembershipProfile,
  MovieSnapshot,
  WatchlistItem,
  Viewing,
  Ticket,
  TheatreSnapshot,
  AListTheatre,
  SharedViewing,
  CalendarShare,
  AddedCalendar,
  ShareFeed,
  PurchasePlan,
  AListEmailEvent,
} from '@apps/a-list/types';

const MEMBERSHIP_PROFILE_FIELDS = {
  uid: 'never',
  monthlyCostCents: 'never',
  monthlyTotalCents: 'shared',
  taxRate: 'never',
  startDate: 'shared',
  weeklyGoal: 'shared',
  monthlyGoal: 'shared',
  favoriteTheatreId: 'never',
  ticketPriceKind: 'never',
  showReleasesOnCalendar: 'never',
  setupCompletedAt: 'never',
  createdAt: 'never',
  lastEditedAt: 'shared',
} satisfies Record<keyof MembershipProfile, ShareDecision>;

const MOVIE_SNAPSHOT_FIELDS = {
  title: 'shared',
  releaseDate: 'shared',
  posterUrl: 'notUseful',
  runtimeMinutes: 'shared',
  contentRating: 'shared',
} satisfies Record<keyof MovieSnapshot, ShareDecision>;

const WATCHLIST_ITEM_FIELDS = {
  movieKey: 'notUseful',
  movie: 'shared',
  priority: 'shared',
  preferredFormat: 'notUseful',
  archivedAt: 'filter',
  archiveReason: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof WatchlistItem, ShareDecision>;

const VIEWING_FIELDS = {
  id: 'notUseful',
  movieKey: 'filter',
  movie: 'shared',
  showtimeAt: 'shared',
  endsAt: 'shared',
  status: 'filter',
  ticket: 'filter',
  theatre: 'shared',
  purchase: 'never',
  rating: 'shared',
  trailerReminderId: 'notUseful',
  amcConfirmation: 'never',
  amcTicketCount: 'never',
  amcRefundedOrders: 'never',
  emailEventId: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof Viewing, ShareDecision>;

const TICKET_FIELDS = {
  entryMode: 'filter',
  format: 'never',
  priceCents: 'never',
  standardPriceCents: 'never',
  feeAvoidedCents: 'never',
  taxRate: 'never',
  taxCents: 'never',
  taxChoice: 'never',
  totalCents: 'shared',
} satisfies Record<keyof Ticket, ShareDecision>;

const THEATRE_SNAPSHOT_FIELDS = {
  theatreId: 'notUseful',
  name: 'shared',
  city: 'notUseful',
  state: 'notUseful',
  timeZone: 'shared',
} satisfies Record<keyof TheatreSnapshot, ShareDecision>;

const ALIST_THEATRE_FIELDS = {
  theatreId: 'notUseful',
  name: 'shared',
  addressLine: 'shared',
  city: 'shared',
  state: 'shared',
  postalCode: 'shared',
  latitude: 'notUseful',
  longitude: 'notUseful',
  timeZone: 'shared',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof AListTheatre, ShareDecision>;

const SHARED_VIEWING_FIELDS = {
  title: 'never',
  posterUrl: 'never',
  runtimeMinutes: 'never',
  contentRating: 'never',
  showtimeAt: 'never',
  status: 'never',
  format: 'never',
  theatreName: 'never',
} satisfies Record<keyof SharedViewing, ShareDecision>;

const CALENDAR_SHARE_FIELDS = {
  id: 'never',
  ownerUid: 'never',
  kind: 'never',
  startDate: 'never',
  endDate: 'never',
  feedId: 'never',
  feedPin: 'never',
  pin: 'never',
  viewings: 'never',
  createdAt: 'never',
  lastEditedAt: 'never',
} satisfies Record<keyof CalendarShare, ShareDecision>;

const SHARE_FEED_FIELDS = {
  kind: 'never',
  startDate: 'never',
  endDate: 'never',
  createdAt: 'never',
  viewings: 'never',
  updatedAt: 'never',
} satisfies Record<keyof ShareFeed, ShareDecision>;

const ADDED_CALENDAR_FIELDS = {
  id: 'never',
  feedId: 'never',
  personName: 'never',
  kind: 'never',
  isShown: 'never',
  createdAt: 'never',
  lastEditedAt: 'never',
} satisfies Record<keyof AddedCalendar, ShareDecision>;

const PURCHASE_PLAN_FIELDS = {
  showtimeId: 'never',
  format: 'never',
  priceCents: 'never',
  standardPriceCents: 'never',
  taxCents: 'never',
  purchaseUrl: 'never',
  isDiscountDay: 'never',
  startedAt: 'never',
} satisfies Record<keyof PurchasePlan, ShareDecision>;

const EMAIL_EVENT_FIELDS = {
  id: 'never',
  receivedAt: 'never',
  outcome: 'never',
  from: 'never',
  subject: 'never',
  snippet: 'never',
  readBy: 'never',
  viewingId: 'never',
  movieTitle: 'never',
  showtimeAt: 'never',
  theatreName: 'never',
  confirmation: 'never',
  ticketCount: 'never',
  removedViewing: 'never',
  priorViewing: 'never',
  watchlistKey: 'never',
  undoneAt: 'never',
  expiresAt: 'never',
} satisfies Record<keyof AListEmailEvent, ShareDecision>;

/** What a-list lets Helm read, per stored field; an added, removed or renamed field fails the typecheck until it is decided here. */
export const SHARE_FIELDS = {
  MembershipProfile: MEMBERSHIP_PROFILE_FIELDS,
  MovieSnapshot: MOVIE_SNAPSHOT_FIELDS,
  WatchlistItem: WATCHLIST_ITEM_FIELDS,
  Viewing: VIEWING_FIELDS,
  Ticket: TICKET_FIELDS,
  TheatreSnapshot: THEATRE_SNAPSHOT_FIELDS,
  AListTheatre: ALIST_THEATRE_FIELDS,
  SharedViewing: SHARED_VIEWING_FIELDS,
  CalendarShare: CALENDAR_SHARE_FIELDS,
  ShareFeed: SHARE_FEED_FIELDS,
  AddedCalendar: ADDED_CALENDAR_FIELDS,
  PurchasePlan: PURCHASE_PLAN_FIELDS,
  AListEmailEvent: EMAIL_EVENT_FIELDS,
};

/** Exported types that are not stored, so have no fields to decide. */
export const NOT_STORED: Record<string, string> = {
  MovieSearchResult: 'provider search result',
  PopularMovie: 'provider trailers result',
  SharedCalendar: 'share function response',
  TheatreSearchResult: 'provider search result',
  ShowtimeOption: 'provider showtime result',
  TheatrePlace: 'provider search result',
};
