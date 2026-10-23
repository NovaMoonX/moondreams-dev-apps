import type { RunwayTab } from '@apps/runway/types';

export const RUNWAY_TABS = [
  'home',
  'days',
  'plan',
] as const satisfies readonly RunwayTab[];

export const DEFAULT_RUNWAY_TAB: RunwayTab = 'home';

export const RUNWAY_TAB_LABELS: Record<RunwayTab, string> = {
  home: 'Home',
  days: 'Days',
  plan: 'Plan',
};
