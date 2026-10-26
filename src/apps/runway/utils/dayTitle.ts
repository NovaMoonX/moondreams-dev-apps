const dayTitleFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "Thu, Oct 29": the day an income day's screen is about. */
export const formatDayTitle = (on: number) => dayTitleFormatter.format(on);
