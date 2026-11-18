const QUOTE_DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const QUOTE_UTC_DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** The day with no-break spaces, so "Sun, Nov 8" never splits across lines; an app's date-only day is read in UTC. */
export const formatQuoteDay = (at: number, isDateOnly: boolean) =>
  (isDateOnly ? QUOTE_UTC_DAY : QUOTE_DAY).format(at).replace(/ /g, ' ');
