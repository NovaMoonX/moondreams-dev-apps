const HIT =
  "relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']";

/** Classes for a notice's main action: a solid button in the notice's own tone (pass with `variant='primary'` and `size='sm'`), with a 40px hit area. */
export const NOTICE_ACTION_CLASSES = {
  info: `${HIT} bg-foreground! text-background! hover:bg-foreground/90!`,
  warning: `${HIT} bg-warning! text-warning-foreground! hover:bg-warning/90!`,
  success: `${HIT} bg-success! text-success-foreground! hover:bg-success/90!`,
} as const;

/** Classes for a notice's second action: a plain text button in the notice's tone (pass with `variant='tertiary'` and `size='sm'`), with a 40px hit area. */
export const NOTICE_QUIET_CLASSES = {
  info: `${HIT} text-foreground! underline underline-offset-2`,
  warning: `${HIT} text-warning-foreground! dark:text-warning! underline underline-offset-2`,
  success: `${HIT} text-success! underline underline-offset-2`,
} as const;
