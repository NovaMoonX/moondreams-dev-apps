import type { AListTab, AmcFormat, WatchPriority } from '@apps/a-list/types';

export const A_LIST_TABS: AListTab[] = ['dashboard', 'calendar', 'watchlist'];
export const DEFAULT_A_LIST_TAB: AListTab = 'calendar';

export const A_LIST_TAB_LABELS: Record<AListTab, string> = {
  dashboard: 'Dashboard',
  calendar: 'Calendar',
  watchlist: 'Watchlist',
};

export const A_LIST_PERKS = [
  'See up to four movies every week',
  'Premium formats are included, like IMAX, Dolby Cinema, PRIME and RealD 3D',
  'No convenience fees when you book online',
  'Free size upgrades on popcorn and fountain drinks',
  'All the other AMC Stubs Premiere perks',
];

export const MAX_TAX_RATE = 0.25;
/** Matches the rules' cap on any stored amount. */
export const MAX_AMOUNT_CENTS = 1_000_000;
export const MAX_WEEKLY_GOAL = 21;
export const MAX_MONTHLY_GOAL = 93;

export const MOVIE_SEARCH_MIN_CHARS = 2;
export const MOVIE_DETAILS_STALE_MS = 24 * 60 * 60 * 1000;

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

export const DEFAULT_WATCH_PRIORITY: WatchPriority = 'WANT_TO_SEE';

/** Used when the provider has no runtime. */
export const DEFAULT_RUNTIME_MINUTES = 120;
/** Trailers before the feature: a showing ends at showtime + previews + runtime. */
export const PREVIEWS_BUFFER_MINUTES = 20;
export const DEFAULT_SHOWTIME = '19:00';
/** Weeks start on Sunday (0), matching the calendar grid. */
export const WEEK_STARTS_ON = 0;

export const MAX_FEE_CHIPS = 4;
export const MAX_TAX_CHIPS = 4;
