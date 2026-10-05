import type {
  AListTab,
  AmcFormat,
  WatchlistFilter,
  WatchPriority,
} from '@apps/a-list/types';

export const A_LIST_TABS: AListTab[] = ['dashboard', 'calendar', 'watchlist'];
export const DEFAULT_A_LIST_TAB: AListTab = 'calendar';

export const A_LIST_TAB_LABELS: Record<AListTab, string> = {
  dashboard: 'Dashboard',
  calendar: 'Calendar',
  watchlist: 'Watchlist',
};

export const A_LIST_PERKS = [
  { emoji: '🎟️', text: 'See up to four movies every week' },
  {
    emoji: '📽️',
    text: 'Premium formats are included, like IMAX, Dolby Cinema, PRIME and RealD 3D',
  },
  { emoji: '💸', text: 'No convenience fees when you book online' },
  { emoji: '🥤', text: 'Free size upgrades on popcorn and fountain drinks' },
  { emoji: '⭐', text: 'All the other AMC Stubs Premiere perks' },
];

export const MAX_TAX_RATE = 0.25;
/** Matches the rules' cap on any stored amount. */
export const MAX_AMOUNT_CENTS = 1_000_000;
export const MAX_WEEKLY_GOAL = 21;
export const MAX_MONTHLY_GOAL = 93;

export const MOVIE_SEARCH_MIN_CHARS = 2;
export const MOVIE_DETAILS_STALE_MS = 24 * 60 * 60 * 1000;
export const REFRESH_BATCH_SIZE = 10;

export const AMC_FORMATS: AmcFormat[] = [
  'STANDARD',
  'DOLBY_CINEMA',
  'IMAX',
  'PRIME',
  'REALD_3D',
  'LASER',
];

export const AMC_FORMAT_LABELS: Record<AmcFormat, string> = {
  STANDARD: 'Standard',
  DOLBY_CINEMA: 'Dolby Cinema',
  IMAX: 'IMAX',
  PRIME: 'PRIME at AMC',
  REALD_3D: 'RealD 3D',
  LASER: 'Laser',
};

export const WATCH_PRIORITIES: WatchPriority[] = [
  'MUST_SEE',
  'WANT_TO_SEE',
  'IF_I_HAVE_TIME',
];

export const WATCH_PRIORITY_LABELS: Record<WatchPriority, string> = {
  MUST_SEE: 'Must See',
  WANT_TO_SEE: 'Want to See',
  IF_I_HAVE_TIME: 'If I Have Time',
};

export const WATCH_PRIORITY_EMOJIS: Record<WatchPriority, string> = {
  MUST_SEE: '🔥',
  WANT_TO_SEE: '🍿',
  IF_I_HAVE_TIME: '⏳',
};

export const DEFAULT_WATCH_PRIORITY: WatchPriority = 'WANT_TO_SEE';

/** Used when the provider has no runtime. */
export const DEFAULT_RUNTIME_MINUTES = 120;
/** Trailers before the feature: a showing ends at showtime + previews + runtime. */
export const PREVIEWS_BUFFER_MINUTES = 20;
export const DEFAULT_SHOWTIME = '19:00';
/** The "add from trailers" strip shows from this long before a planned showing until this long after it starts. */
export const PREVIEWS_WINDOW_BEFORE_MINUTES = 30;
export const PREVIEWS_WINDOW_AFTER_MINUTES = 10;
/** AMC's week turns over on Friday (5), when new releases open; the calendar grid itself still starts on Sunday. */
export const WEEK_STARTS_ON = 5;

export const MAX_FEE_CHIPS = 4;
export const MAX_TAX_CHIPS = 4;

/** The Opening tab lists unseen movies releasing from today through this many days out. */
export const OPENING_WINDOW_DAYS = 7;

/** Pills that narrow the watchlist; none on means everything. Priorities combine with "or", the rest with "and". */
export const WATCHLIST_FILTERS: WatchlistFilter[] = [
  'opening',
  'MUST_SEE',
  'WANT_TO_SEE',
  'IF_I_HAVE_TIME',
  'seen',
];
