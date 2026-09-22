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

export function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Date only, no time-of-day — for things nothing in the app ever asks a time for (vaccinations, preventives, weight, expenses). */
export function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const isCurrentYear = date.getFullYear() === new Date().getFullYear();

  return date.toLocaleDateString(undefined, {
    ...(isCurrentYear ? {} : { year: 'numeric' }),
    month: 'long',
    day: 'numeric',
  });
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