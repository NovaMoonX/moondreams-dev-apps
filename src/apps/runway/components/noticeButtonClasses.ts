const HIT =
  "relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']";

/** Classes for the buttons inside a tinted `InlineNotice`: the main action is outlined in the notice's own tone, a second is a transparent text button. */
export const NOTICE_MAIN_BUTTON = {
  info: `${HIT} border-foreground/30!`,
  warning: `${HIT} border-warning/60!`,
} as const;

export const NOTICE_QUIET_BUTTON = HIT;
