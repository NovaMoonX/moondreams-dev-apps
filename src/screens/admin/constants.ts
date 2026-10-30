import { join } from '@moondreamsdev/dreamer-ui/utils';

export const MEMBER_SEARCH_THRESHOLD = 8;

export const APP_SEARCH_THRESHOLD = 8;

export const AVAILABLE_USERS_PREVIEW = 5;

export const USAGE_SEARCH_THRESHOLD = 8;

export const USAGE_PREVIEW_ROWS = 8;

/** The site defines no `--color-card`, so `bg-card` draws nothing outside an app's theme. */
export const SURFACE_CLASS = 'bg-white dark:bg-zinc-900';

export const CARD_CLASS = join(
  SURFACE_CLASS,
  'border-border/60 rounded-2xl border p-4 shadow-sm sm:p-5',
);

/** The page canvas: a visible step under the cards in light; in dark the near-black page the raised cards sit on. */
export const CANVAS_CLASS = 'bg-muted dark:bg-background';

export const LIST_CARD_CLASS = join(
  SURFACE_CLASS,
  'border-border/60 divide-border/60 divide-y overflow-hidden rounded-2xl border shadow-sm',
);

/** A disabled button that keeps a hairline and text readable at about 3:1. */
export const DISABLED_CLASS =
  'disabled:border disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100';

/** What waits on the owner: one accent for the figure, dot and card edge. */
export const WAITING_TEXT_CLASS = 'text-indigo-600 dark:text-indigo-400';

export const WAITING_DOT_CLASS =
  'bg-indigo-500 ring-4 ring-indigo-500/15 dark:bg-indigo-400 dark:ring-indigo-400/20';

export const WAITING_EDGE_CLASS =
  'border-l-2 border-l-indigo-500 dark:border-l-indigo-400';
