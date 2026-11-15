const DAY_MS = 86_400_000;

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: 'UTC',
});

/** Date-only values (UTC midnight) as whole days, once each, oldest first, keeping at most `max`. */
export const normalizeDays = (days: readonly number[], max = Infinity) =>
  Array.from(
    new Set(
      days
        .filter((day) => Number.isFinite(day))
        .map((day) => Math.floor(day / DAY_MS) * DAY_MS),
    ),
  )
    .sort((left, right) => left - right)
    .slice(0, max);

/** Every day from `first` to `last`, both included, whichever order they come in. */
export const getDaysBetween = (first: number, last: number) => {
  const [start, end] = first <= last ? [first, last] : [last, first];
  return Array.from(
    { length: Math.round((end - start) / DAY_MS) + 1 },
    (_, offset) => start + offset * DAY_MS,
  );
};

/** Sorted date-only days split into runs of consecutive days. */
export const toDayRuns = (days: readonly number[]): number[][] =>
  normalizeDays(days).reduce<number[][]>((runs, day) => {
    const last = runs.at(-1);
    if (last !== undefined && day - (last.at(-1) ?? 0) === DAY_MS)
      return [...runs.slice(0, -1), [...last, day]];
    return [...runs, [day]];
  }, []);

const formatDay = (day: number) => {
  const date = new Date(day);
  return `${monthFormatter.format(date)} ${date.getUTCDate()}`;
};

/** One run of days in a few characters: "Dec 2", "Nov 28–30", "Nov 30–Dec 2". */
export const formatDayRun = (run: readonly number[]) => {
  const first = run[0];
  const last = run.at(-1);
  if (first === undefined || last === undefined) return '';
  if (first === last) return formatDay(first);
  const isSameMonth =
    new Date(first).getUTCMonth() === new Date(last).getUTCMonth();
  return isSameMonth
    ? `${formatDay(first)}–${new Date(last).getUTCDate()}`
    : `${formatDay(first)}–${formatDay(last)}`;
};

/** Date-only days as their runs: "Nov 28–30, Dec 2, Dec 15–21". */
export const formatDayRuns = (days: readonly number[]) =>
  toDayRuns(days).map(formatDayRun).join(', ');

/** Today in the device's time zone as a date-only value, to compare with stored days. */
export const getLocalToday = (now: number) => {
  const date = new Date(now);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
};
