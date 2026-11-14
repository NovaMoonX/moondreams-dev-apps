export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A repeat by weekdays, times a week or every N days. `anchor` is date-only (UTC midnight); `timesPerWeek` counts Monday to Sunday. */
export type Cadence =
  | { kind: 'everyDay' }
  | { kind: 'onWeekdays'; weekdays: Weekday[] }
  | { kind: 'timesPerWeek'; count: number }
  | { kind: 'everyNDays'; days: number; anchor: number };

const DAY_MS = 86_400_000;
const SEARCH_DAYS = 400;

const toMs = (dayKey: string) => Date.parse(`${dayKey}T00:00:00Z`);
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const mondayOffset = (ms: number) => (new Date(ms).getUTCDay() + 6) % 7;

/** Whether a day ("YYYY-MM-DD") is one the cadence asks for; a times-a-week cadence asks on every day until its count is met. */
export function isDueOn(cadence: Cadence, dayKey: string): boolean {
  const day = toMs(dayKey);
  if (cadence.kind === 'onWeekdays') {
    return cadence.weekdays.includes(new Date(day).getUTCDay() as Weekday);
  }
  if (cadence.kind === 'everyNDays') {
    const gap = Math.round((day - cadence.anchor) / DAY_MS);
    return ((gap % cadence.days) + cadence.days) % cadence.days === 0;
  }
  return true;
}

/** How many days from `fromKey` to `toKey` (both inclusive) the cadence asks for; a times-a-week cadence asks for at most its count in each Monday-to-Sunday week. */
export function countDueDays(
  cadence: Cadence,
  fromKey: string,
  toKeyInclusive: string,
): number {
  const from = toMs(fromKey);
  const to = toMs(toKeyInclusive);
  if (to < from) return 0;
  const days = Math.round((to - from) / DAY_MS) + 1;
  if (cadence.kind !== 'timesPerWeek') {
    return Array.from({ length: days }).filter((_, at) =>
      isDueOn(cadence, toKey(from + at * DAY_MS)),
    ).length;
  }
  const perWeek = Array.from({ length: days }).reduce<Map<number, number>>(
    (weeks, _, at) => {
      const day = from + at * DAY_MS;
      const monday = day - mondayOffset(day) * DAY_MS;
      return weeks.set(monday, (weeks.get(monday) ?? 0) + 1);
    },
    new Map(),
  );
  return [...perWeek.values()].reduce(
    (total, inWeek) => total + Math.min(cadence.count, inWeek),
    0,
  );
}

/** The first day after `afterKey` the cadence asks for, or null when none falls within about a year. */
export function nextDueOn(cadence: Cadence, afterKey: string): string | null {
  const after = toMs(afterKey);
  const found = Array.from({ length: SEARCH_DAYS }, (_, at) =>
    toKey(after + (at + 1) * DAY_MS),
  ).find((key) => isDueOn(cadence, key));
  return found ?? null;
}
