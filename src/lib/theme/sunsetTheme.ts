import type { Coordinates } from '@/utils/geolocationUtils';
import { getSunTimes } from '@/utils/sunUtils';

/** Read before first paint by the inline script in `index.html`; keep the two in step. */
export const SUNSET_MINUTES_KEY = 'moondreams-sunset-minutes';
export const SUN_PLACE_KEY = 'moondreams-sun-place';

/** The person's answer to the location question: a rounded position and the zone it was taken in, or a no. */
export type SunPlace =
  | { kind: 'location'; latitude: number; longitude: number; timeZone: string | null }
  | { kind: 'declined' };

/** Today's sunrise and sunset as minutes after local midnight, for the script that paints before the app loads. */
interface SunsetMinutes {
  rise: number;
  set: number;
}

export interface SunsetState {
  isDark: boolean;
  /** When the look flips next (epoch ms): the next sunrise or sunset, or local midnight on a day with neither. */
  nextSwitchAt: number;
  /** Which way it flips at `nextSwitchAt`; null on a day the sun neither rises nor sets. */
  nextSwitchTo: 'light' | 'dark' | null;
  /** True when the times come from the time zone (or a fixed 7 to 7) rather than the person's location. */
  isEstimate: boolean;
}

const DAY_MINUTES = 1440;
const FALLBACK_MINUTES: SunsetMinutes = { rise: 7 * 60, set: 19 * 60 };

export const readSunPlace = (): SunPlace | null => {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(SUN_PLACE_KEY) ?? 'null');
    if (typeof stored !== 'object' || stored === null || !('kind' in stored)) {
      return null;
    }
    if (stored.kind === 'declined') {
      return { kind: 'declined' };
    }
    const place = stored as Partial<Extract<SunPlace, { kind: 'location' }>>;
    if (typeof place.latitude === 'number' && typeof place.longitude === 'number') {
      return {
        kind: 'location',
        latitude: place.latitude,
        longitude: place.longitude,
        timeZone: typeof place.timeZone === 'string' ? place.timeZone : null,
      };
    }
    return null;
  } catch {
    return null;
  }
};

export const storeSunPlace = (place: SunPlace) => {
  try {
    window.localStorage.setItem(SUN_PLACE_KEY, JSON.stringify(place));
  } catch {
    // Blocked storage: the answer still holds for this visit.
  }
};

const readCachedMinutes = (): SunsetMinutes => {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(SUNSET_MINUTES_KEY) ?? 'null');
    if (
      typeof stored === 'object' &&
      stored !== null &&
      'rise' in stored &&
      'set' in stored &&
      typeof stored.rise === 'number' &&
      typeof stored.set === 'number'
    ) {
      return { rise: stored.rise, set: stored.set };
    }
    return FALLBACK_MINUTES;
  } catch {
    return FALLBACK_MINUTES;
  }
};

const startOfLocalDay = (at: number, dayOffset = 0) => {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset).getTime();
};

const minutesIntoDay = (at: number) => {
  const date = new Date(at);
  return date.getHours() * 60 + date.getMinutes();
};

const atMinute = (dayStart: number, minute: number) => {
  const date = new Date(dayStart);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, minute).getTime();
};

// A whole day of dark is stored as rise = set = 1440, a whole day of light as rise 0 and set 1440,
// so the paint script's single "before rise or after set" test covers both.
const toMinutes = (dayStart: number, coordinates: Coordinates | null): SunsetMinutes => {
  if (!coordinates) {
    return FALLBACK_MINUTES;
  }
  const { sunrise, sunset, isUpAllDay } = getSunTimes(new Date(dayStart), coordinates);
  if (sunrise === null || sunset === null) {
    return isUpAllDay ? { rise: 0, set: DAY_MINUTES } : { rise: DAY_MINUTES, set: DAY_MINUTES };
  }
  // Wall-clock minutes, not time elapsed since midnight: a day the clocks change is 23 or 25 hours long.
  const toWallMinute = (at: number) => {
    if (at < dayStart) {
      return 0;
    }
    if (at >= startOfLocalDay(dayStart, 1)) {
      return DAY_MINUTES;
    }
    return minutesIntoDay(Math.round(at / 60_000) * 60_000);
  };
  return { rise: toWallMinute(sunrise), set: toWallMinute(sunset) };
};

const isPolar = ({ rise, set }: SunsetMinutes) => set === DAY_MINUTES && (rise === 0 || rise === DAY_MINUTES);

const resolveFromMinutes = (
  now: number,
  today: SunsetMinutes,
  tomorrow: SunsetMinutes,
  isEstimate: boolean,
): SunsetState => {
  const dayStart = startOfLocalDay(now);
  const minute = minutesIntoDay(now);
  const isDark = minute < today.rise || minute >= today.set;

  if (isPolar(today)) {
    return { isDark, nextSwitchAt: startOfLocalDay(now, 1), nextSwitchTo: null, isEstimate };
  }
  if (minute < today.rise) {
    return { isDark, nextSwitchAt: atMinute(dayStart, today.rise), nextSwitchTo: 'light', isEstimate };
  }
  if (minute < today.set) {
    return { isDark, nextSwitchAt: atMinute(dayStart, today.set), nextSwitchTo: 'dark', isEstimate };
  }
  if (isPolar(tomorrow)) {
    return { isDark, nextSwitchAt: startOfLocalDay(now, 1), nextSwitchTo: null, isEstimate };
  }
  return {
    isDark,
    nextSwitchAt: atMinute(startOfLocalDay(now, 1), tomorrow.rise),
    nextSwitchTo: 'light',
    isEstimate,
  };
};

/** Whether Sunset shows dark at `now` and when it next flips. `coordinates` undefined means the
 * zone's position is still loading, so the last stored times stand in; null means no position is known. */
export function resolveSunset(
  now: number,
  coordinates: Coordinates | null | undefined,
  isEstimate: boolean,
): { state: SunsetState; todayMinutes: SunsetMinutes | null } {
  if (coordinates === undefined) {
    const cached = readCachedMinutes();
    return { state: resolveFromMinutes(now, cached, cached, isEstimate), todayMinutes: null };
  }
  const today = toMinutes(startOfLocalDay(now), coordinates);
  const tomorrow = toMinutes(startOfLocalDay(now, 1), coordinates);
  return { state: resolveFromMinutes(now, today, tomorrow, isEstimate), todayMinutes: today };
}

export const storeSunsetMinutes = (minutes: SunsetMinutes) => {
  try {
    window.localStorage.setItem(SUNSET_MINUTES_KEY, JSON.stringify(minutes));
  } catch {
    // The paint script falls back to 7 to 7 for the first frame.
  }
};
