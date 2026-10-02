let cachedTimezoneOptions: { value: string; text: string }[] | null = null;

/** IANA zone name ("America/Los_Angeles") -> readable label ("America / Los Angeles"), no underscores. */
export function formatTimezoneLabel(zone: string): string {
  return zone
    .split('/')
    .map((part) => part.replace(/_/g, ' '))
    .join(' / ');
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

/** The instant a wall-clock `date` ("YYYY-MM-DD") + `time` ("HH:mm") occurs in an IANA `timeZone`.
 * Two passes so a DST change between the guess and the answer still lands on the right offset. */
export function zonedDateTimeToEpoch(date: string, time: string, timeZone: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = wallClockAsUtc - getZoneOffsetMs(wallClockAsUtc, timeZone);
  const result = wallClockAsUtc - getZoneOffsetMs(firstGuess, timeZone);
  return result;
}

/** Every IANA timezone the runtime supports, as `{ value, text }` select options sorted by label. */
export function getTimezoneOptions(): { value: string; text: string }[] {
  if (cachedTimezoneOptions) {
    return cachedTimezoneOptions;
  }

  const zones =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : [];
  cachedTimezoneOptions = zones
    .map((zone) => ({ value: zone, text: formatTimezoneLabel(zone) }))
    .sort((a, b) => a.text.localeCompare(b.text));

  return cachedTimezoneOptions;
}
