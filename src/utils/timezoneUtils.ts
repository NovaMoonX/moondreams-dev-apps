const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();

/** One `Intl.DateTimeFormat` per locale and options, built once: building one costs far more than formatting with it. */
export function getDateTimeFormat(options: Intl.DateTimeFormatOptions, locale = 'en-US'): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  const cached = dateTimeFormats.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, options);
  dateTimeFormats.set(key, formatter);
  return formatter;
}

const zoneNameFormatters = new Map<string, Intl.DateTimeFormat>();

const getZoneNameFormatter = (timeZone: string, timeZoneName: 'longGeneric' | 'short') => {
  const key = `${timeZoneName}|${timeZone}`;
  const cached = zoneNameFormatters.get(key);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName });
  zoneNameFormatters.set(key, formatter);
  return formatter;
};

/** IANA zone name ("America/Los_Angeles") -> readable label ("Los Angeles · Pacific Time"): the city, then
 * the zone's own name, which says whether it observes daylight saving ("Mountain Standard Time" for Phoenix). */
export function formatTimezoneLabel(zone: string): string {
  const city = (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
  try {
    const name = getZoneNameFormatter(zone, 'longGeneric')
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
    const part = getZoneNameFormatter(timeZone, 'short')
      .formatToParts(new Date(at))
      .find((entry) => entry.type === 'timeZoneName');
    return part?.value ?? formatTimezoneLabel(timeZone);
  } catch {
    return formatTimezoneLabel(timeZone);
  }
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

// Building an Intl.DateTimeFormat costs far more than using one, and every event time goes through here.
const getOffsetFormatter = (timeZone: string) => {
  const cached = offsetFormatters.get(timeZone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  offsetFormatters.set(timeZone, formatter);
  return formatter;
};

const getZoneOffsetMs = (epoch: number, timeZone: string) => {
  const parts = getOffsetFormatter(timeZone).formatToParts(new Date(epoch));
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
  const key = `${timeZone}|${date}|${time}`;
  const known = zonedEpochs.get(key);
  if (known !== undefined) {
    return known;
  }
  const result = computeZonedDateTimeToEpoch(date, time, timeZone);
  zonedEpochs.set(key, result);
  return result;
}

const zonedEpochs = new Map<string, number>();

function computeZonedDateTimeToEpoch(date: string, time: string, timeZone: string): number {
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

/** The device's IANA time zone ("America/Los_Angeles"), read fresh each call so a phone that changed zones is seen at once; null when the runtime doesn't say. */
export function getDeviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Where a time zone's principal city is (the tz database's own reference point), loaded on first use; null for a zone it doesn't list. A rough position, never the person's. */
export async function loadTimeZoneCoordinates(
  timeZone: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const { ZONE_COORDINATES } = await import('@/data/tzdb/zoneCoordinates');
  const point = ZONE_COORDINATES[timeZone];
  return point ? { latitude: point[0], longitude: point[1] } : null;
}
