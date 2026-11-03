const titleFormatters = {
  currentYear: new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }),
  otherYear: new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }),
};

/** "Thu, Oct 29", or "Thu, Nov 4, 2027" outside this year: the day an income day's screen is about. */
export const formatDayTitle = (on: number) => {
  const isCurrentYear =
    new Date(on).getUTCFullYear() === new Date().getUTCFullYear();
  const formatter = isCurrentYear
    ? titleFormatters.currentYear
    : titleFormatters.otherYear;
  return formatter.format(on);
};
