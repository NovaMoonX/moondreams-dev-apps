import type { AListTab } from '@apps/a-list/types';

export const A_LIST_TABS: AListTab[] = ['dashboard', 'calendar', 'watchlist'];
export const DEFAULT_A_LIST_TAB: AListTab = 'calendar';

export const A_LIST_TAB_LABELS: Record<AListTab, string> = {
  dashboard: 'Dashboard',
  calendar: 'Calendar',
  watchlist: 'Watchlist',
};

export const A_LIST_PERKS = [
  'See up to four movies every week',
  'Every format is included: IMAX, Dolby Cinema, PRIME, RealD 3D and Laser',
  'No convenience fees when you book online',
  'Free size upgrades on popcorn and fountain drinks',
  'All the other AMC Stubs Premiere perks',
];

export const MAX_TAX_RATE = 0.25;
export const MAX_WEEKLY_GOAL = 21;
export const MAX_MONTHLY_GOAL = 93;
