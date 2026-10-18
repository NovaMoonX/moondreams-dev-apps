const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** A quota that resets at Pacific midnight is counted by Pacific days. */
export const getQuotaDay = (now: number, timeZone: string) => {
  const formatter =
    dayFormatters.get(timeZone) ??
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  dayFormatters.set(timeZone, formatter);
  return formatter.format(now);
};

export const PERSON_WINDOW_MS = 60_000;
export const PERSON_PER_WINDOW = 10;
export const PERSON_PER_DAY = 100;

export interface PersonUsage {
  windowStart: number;
  windowCount: number;
  day: string;
  dayCount: number;
}

export const stepPersonUsage = (
  previous: PersonUsage | null,
  now: number,
  day: string,
): { allowed: boolean; next: PersonUsage } => {
  const inWindow =
    previous !== null && now - previous.windowStart < PERSON_WINDOW_MS;
  const windowCount = inWindow ? previous.windowCount : 0;
  const dayCount = previous?.day === day ? previous.dayCount : 0;
  if (windowCount >= PERSON_PER_WINDOW || dayCount >= PERSON_PER_DAY) {
    return {
      allowed: false,
      next: previous ?? { windowStart: now, windowCount, day, dayCount },
    };
  }
  return {
    allowed: true,
    next: {
      windowStart: inWindow ? previous.windowStart : now,
      windowCount: windowCount + 1,
      day,
      dayCount: dayCount + 1,
    },
  };
};

export const stepBudget = (count: number, cap: number) => ({
  allowed: count < cap,
  next: count < cap ? count + 1 : count,
});

export const readCap = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return value !== undefined &&
    value.trim() !== '' &&
    Number.isInteger(parsed) &&
    parsed >= 0
    ? parsed
    : fallback;
};
