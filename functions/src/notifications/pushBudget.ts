/** Per person, per app, per local day: the most pushes nobody asked for. A reminder the person set themselves is not counted. */
export const DAILY_UNREQUESTED_CAP = 3;

/** Nothing unrequested goes out from this local hour... */
export const QUIET_FROM_HOUR = 22;

/** ...until this one. */
export const QUIET_UNTIL_HOUR = 8;

export function isQuietHour(hour: number): boolean {
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}

/** How many unrequested pushes the person has had on `day`; a stored count from an earlier day is spent. */
export function readPushCount(stored: { day?: unknown; count?: unknown } | undefined, day: string): number {
  return stored?.day === day && typeof stored.count === 'number' ? stored.count : 0;
}

export type PushVerdict = 'send' | 'quiet' | 'capped';

/** A push that is quiet or over the cap is dropped, never held for later. */
export function decidePush(countToday: number, hour: number): PushVerdict {
  if (isQuietHour(hour)) {
    return 'quiet';
  }
  return countToday >= DAILY_UNREQUESTED_CAP ? 'capped' : 'send';
}
