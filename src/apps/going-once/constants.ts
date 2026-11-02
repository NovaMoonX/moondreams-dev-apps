import type { ItemCondition } from '@apps/going-once/types';

/** The feature switch for starting new sales (`FEATURE_GATES`). */
export const CREATE_SALES_GATE_ID = 'create-sales';

export const GOING_ONCE_TABS = ['things', 'inbox', 'sale'] as const;

export const DEFAULT_GOING_ONCE_TAB = 'things';

export const GOING_ONCE_TAB_LABELS = {
  things: 'Things',
  inbox: 'Inbox',
  sale: 'Sale',
} as const;

export const SALE_NAME_SUGGESTIONS = [
  'Clear-out',
  'Garage sale',
  'Estate sale',
] as const;

export const MAX_SALE_NAME_LENGTH = 80;
export const MAX_PICKUP_AREA_LENGTH = 80;
export const MAX_BUYER_NOTE_LENGTH = 300;

export const MAX_ITEM_PHOTOS = 12;
export const MAX_ITEM_TITLE_LENGTH = 120;

export const CONDITION_OPTIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'LIKE_NEW', label: 'Like new' },
  { value: 'GOOD', label: 'Good' },
  { value: 'FAIR', label: 'Fair' },
  { value: 'WELL_USED', label: 'Well used' },
] as const satisfies readonly { value: ItemCondition; label: string }[];

export const CONDITION_LABELS: Record<ItemCondition, string> = {
  NEW: 'New',
  LIKE_NEW: 'Like new',
  GOOD: 'Good',
  FAIR: 'Fair',
  WELL_USED: 'Well used',
};
