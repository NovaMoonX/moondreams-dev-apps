export const DAY_MS = 86_400_000;

/** A calendar day as UTC midnight, from any instant already at UTC midnight or later that day. */
export function startOfUtcDay(timestamp: number): number {
  const result = Math.floor(timestamp / DAY_MS) * DAY_MS;
  return result;
}

export function addUtcDays(date: number, days: number): number {
  const result = date + days * DAY_MS;
  return result;
}

export function daysInUtcMonth(year: number, month: number): number {
  const result = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return result;
}

/** `date` moved by whole months with its day clamped to the target month's length. */
export function addUtcMonths(date: number, months: number): number {
  const source = new Date(date);
  const target = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1),
  );
  const day = Math.min(
    source.getUTCDate(),
    daysInUtcMonth(target.getUTCFullYear(), target.getUTCMonth()),
  );
  const result = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day);
  return result;
}

/** `yyyymmdd` of a UTC-midnight date. */
export function toDayStamp(date: number): string {
  const value = new Date(date);
  const pad = (part: number, size: number) => String(part).padStart(size, '0');
  const result = `${pad(value.getUTCFullYear(), 4)}${pad(value.getUTCMonth() + 1, 2)}${pad(value.getUTCDate(), 2)}`;
  return result;
}

/** Names one occurrence of a pay line whether or not a document exists for it. */
export function toDayKey(payLineId: string, date: number): string {
  const result = `${payLineId}_${toDayStamp(date)}`;
  return result;
}

/** The pay line a day key names (ids hold no underscore after the stamp, so the last one splits it). */
export function payLineIdOfDayKey(dayKey: string): string {
  const result = dayKey.slice(0, Math.max(0, dayKey.lastIndexOf('_')));
  return result;
}

/** The only reader of the viewer's local day: today as UTC midnight. */
export function todayAsUtcDate(now: number = Date.now()): number {
  const local = new Date(now);
  const result = Date.UTC(
    local.getFullYear(),
    local.getMonth(),
    local.getDate(),
  );
  return result;
}
