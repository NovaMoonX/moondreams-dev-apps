export const MEMBER_SEARCH_THRESHOLD = 8;

export const APP_SEARCH_THRESHOLD = 8;

export const AVAILABLE_USERS_PREVIEW = 5;

export const USAGE_SEARCH_THRESHOLD = 8;

export const USAGE_PREVIEW_ROWS = 8;

/** The site has no card token (`bg-card` draws nothing outside an app's theme), so the surface is named here. */
export const SURFACE_CLASS = 'bg-white dark:bg-zinc-900';

export const CARD_CLASS =
  'bg-white dark:bg-zinc-900 border-border/60 rounded-2xl border p-4 shadow-sm sm:p-5';

/** The page canvas: a visible step under the cards in light; in dark the near-black page the raised cards sit on. */
export const CANVAS_CLASS = 'bg-muted dark:bg-background';

export const LIST_CARD_CLASS =
  'bg-white dark:bg-zinc-900 border-border/60 divide-border/60 divide-y overflow-hidden rounded-2xl border shadow-sm';

/** A disabled button that keeps a hairline and text readable at about 3:1. */
export const DISABLED_CLASS =
  'disabled:border disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100';
