// Copy of `zonedDateTimeToEpoch` in the app's src/utils/timezoneUtils.ts — this package can't import from src.
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
  return wallClockAsUtc - Math.floor(epoch / 1000) * 1000;
};

/** The instant a wall-clock `date` ("YYYY-MM-DD") + `time` ("HH:mm") occurs in an IANA `timeZone`. */
export function zonedDateTimeToEpoch(date: string, time: string, timeZone: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = wallClockAsUtc - getZoneOffsetMs(wallClockAsUtc, timeZone);
  return wallClockAsUtc - getZoneOffsetMs(firstGuess, timeZone);
}
