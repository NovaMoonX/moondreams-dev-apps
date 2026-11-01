export function formatList(names: string[]) {
  if (names.length === 0) {
    return '';
  }

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

// Intl formatters are slow to build and cheap to reuse, and these run for every row of a long timeline.
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
const clockTimes = new Map<string, string>();

export function formatTime(timestamp: number) {
  return timeFormatter.format(new Date(timestamp));
}

export function formatClockTime(hhmm: string) {
  const known = clockTimes.get(hhmm);
  if (known !== undefined) {
    return known;
  }
  const [hours, minutes] = hhmm.split(':').map(Number);
  const formatted = formatTime(new Date(2000, 0, 1, hours, minutes).getTime());
  clockTimes.set(hhmm, formatted);
  return formatted;
}

/** The calendar day of an instant (a real moment, e.g. `createdAt`) in the viewer's timezone.
 * A date-only picker value (`fromDateInputValue`) needs `formatDateUTC` instead. */
export function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const isCurrentYear = date.getFullYear() === new Date().getFullYear();

  return date.toLocaleDateString(undefined, {
    ...(isCurrentYear ? {} : { year: 'numeric' }),
    month: 'long',
    day: 'numeric',
  });
}

const utcDayFormatters = {
  currentYear: new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }),
  otherYear: new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }),
};

/** Like `formatDate`, but reads UTC fields — for a `fromDateInputValue` timestamp
 * (e.g. a trip's `startDate`/`endDate`), where local fields shift the day for viewers behind UTC. */
export function formatDateUTC(timestamp: number) {
  const date = new Date(timestamp);
  const isCurrentYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  const formatter = isCurrentYear
    ? utcDayFormatters.currentYear
    : utcDayFormatters.otherYear;

  return formatter.format(date);
}

const utcShortDayFormatters = {
  currentYear: new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }),
  otherYear: new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }),
};

/** "Nov 1" (with the year when it isn't this one): `formatDateUTC` with the short month, for a date-only value in a tight line. */
export function formatDateShortUTC(timestamp: number) {
  const date = new Date(timestamp);
  const isCurrentYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  const formatter = isCurrentYear
    ? utcShortDayFormatters.currentYear
    : utcShortDayFormatters.otherYear;
  const result = formatter.format(date);
  return result;
}

/** A date-only day as "today", "tomorrow" or "yesterday" when it is one, otherwise "Sep 24"; `today` is a date-only value too. */
export function formatRelativeDayUTC(timestamp: number, today: number) {
  const days = Math.round((timestamp - today) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  const result = formatDateShortUTC(timestamp);
  return result;
}

/** "Sep 24" (with the year when it isn't this one): the calendar day of an instant in the viewer's timezone. */
export function formatDateShort(timestamp: number) {
  const date = new Date(timestamp);
  const isCurrentYear = date.getFullYear() === new Date().getFullYear();

  return date.toLocaleDateString(undefined, {
    ...(isCurrentYear ? {} : { year: 'numeric' }),
    month: 'short',
    day: 'numeric',
  });
}

/** The short month name ("Oct") of an instant in the viewer's timezone. */
export function formatMonthShort(timestamp: number) {
  const result = new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
  });
  return result;
}

/** Minutes-granularity duration string, e.g. "45m" or "2h 5m", for a span of milliseconds. */
export function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  if (totalMinutes < 1) {
    return 'less than a minute';
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }

  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** Minutes-granularity countdown to a future timestamp, e.g. "in 45m" or "in 2h 5m". Assumes targetTimestamp >= now. */
export function formatCountdown(targetTimestamp: number, now: number) {
  const remainingMs = targetTimestamp - now;
  if (Math.round(remainingMs / 60_000) < 1) {
    return 'starting now';
  }

  return `in ${formatDuration(remainingMs)}`;
}

export function formatDateTime(timestamp: number) {
  const date = new Date(timestamp);
  const isCurrentYear = date.getFullYear() === new Date().getFullYear();

  const options: Intl.DateTimeFormatOptions = {
    ...(isCurrentYear ? {} : { year: 'numeric' }),
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };

  return date.toLocaleString(undefined, options);
}