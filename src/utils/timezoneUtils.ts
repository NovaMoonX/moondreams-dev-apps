/** IANA zone name ("America/Los_Angeles") -> readable label ("Los Angeles · Pacific Time"): the city, then
 * the zone's own name, which says whether it observes daylight saving ("Mountain Standard Time" for Phoenix). */
export function formatTimezoneLabel(zone: string): string {
  const city = (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date())
      .find((entry) => entry.type === 'timeZoneName')?.value;
    return name ? `${city} · ${name}` : city;
  } catch {
    return city;
  }
}

/** "PDT", "EST"… as the runtime knows it at `at`; zones without a short name read like "GMT+1". */
export function formatTimezoneAbbreviation(timeZone: string, at: number = Date.now()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
      .formatToParts(new Date(at))
      .find((entry) => entry.type === 'timeZoneName');
    return part?.value ?? formatTimezoneLabel(timeZone);
  } catch {
    return formatTimezoneLabel(timeZone);
  }
}

const getZoneOffsetMs = (epoch: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(epoch));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  );
  const result = wallClockAsUtc - Math.floor(epoch / 1000) * 1000;
  return result;
};

const DAY_MS = 86_400_000;

/** The instant a wall-clock `date` ("YYYY-MM-DD") + `time` ("HH:mm") occurs in an IANA `timeZone`.
 * A time that happens twice (clocks going back) resolves to its first occurrence; one that never
 * happens (clocks springing forward) lands the same distance past the gap, like `new Date(...)`. */
export function zonedDateTimeToEpoch(date: string, time: string, timeZone: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetBefore = getZoneOffsetMs(wallClockAsUtc - DAY_MS, timeZone);
  const offsetAfter = getZoneOffsetMs(wallClockAsUtc + DAY_MS, timeZone);
  const validInstants = Array.from(new Set([offsetBefore, offsetAfter]))
    .map((offset) => ({ offset, instant: wallClockAsUtc - offset }))
    .filter(({ offset, instant }) => getZoneOffsetMs(instant, timeZone) === offset)
    .map(({ instant }) => instant)
    .sort((first, second) => first - second);
  const result = validInstants[0] ?? wallClockAsUtc - offsetBefore;
  return result;
}
