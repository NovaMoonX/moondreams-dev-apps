const toValidZone = (timeZone: string | null) => {
  if (!timeZone) {
    return undefined;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return undefined;
  }
};

/** "7:00 PM" on the wall clock of `timeZone`; the device's own zone when none is known. */
export function formatTimeInZone(epoch: number, timeZone: string | null) {
  const result = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: toValidZone(timeZone),
  }).format(epoch);
  return result;
}

/** "CDT", or whatever short name `timeZone` has at that moment. */
export function getZoneAbbreviation(epoch: number, timeZone: string | null) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short',
    timeZone: toValidZone(timeZone),
  }).formatToParts(epoch);
  const result =
    parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  return result;
}

/** "Central Daylight Time". */
export function getZoneName(epoch: number, timeZone: string | null) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'long',
    timeZone: toValidZone(timeZone),
  }).formatToParts(epoch);
  const result =
    parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  return result;
}

/** True when the theater's wall clock and the device's read the same at that moment. */
export function sharesClockWithDevice(epoch: number, timeZone: string | null) {
  const result =
    toValidZone(timeZone) === undefined ||
    formatTimeInZone(epoch, timeZone) === formatTimeInZone(epoch, null);
  return result;
}

/** "7:00 PM CDT" in the theater's zone, or the device's time with no flag when the theater has none. */
export function formatShowtimeForTheatre(
  epoch: number,
  timeZone: string | null,
) {
  const time = formatTimeInZone(epoch, timeZone);
  const result =
    toValidZone(timeZone) === undefined
      ? time
      : `${time} ${getZoneAbbreviation(epoch, timeZone)}`;
  return result;
}

/** "YYYY-MM-DD" of that moment on the calendar of `timeZone`; the device's own day when none is known. */
export function getDayInZone(epoch: number, timeZone: string | null) {
  const result = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: toValidZone(timeZone),
  }).format(epoch);
  return result;
}
