import { join } from '@moondreamsdev/dreamer-ui/utils';

/** The surfaces of the site's own screens (Home, account, admin), never an app's: the site defines no `--color-card`, so `bg-card` draws nothing outside an app's theme. */
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
