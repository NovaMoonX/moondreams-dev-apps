import { getLocalClock } from '../../notifications/localClock.js';

export const DEFAULT_NOTIFY_HOUR = 19;

export interface DigestSettings {
  hour: number;
  zone: string | null;
}

/** Reads the person's chosen hour and zone from opened sealed fields; a plan sealed before the settings existed lacks both keys. */
export function readDigestSettings(
  sealed: Record<string, unknown>,
): DigestSettings {
  const hour = sealed.notifyHour;
  const zone = sealed.notifyTimeZone;
  return {
    hour:
      typeof hour === 'number' &&
      Number.isInteger(hour) &&
      hour >= 0 &&
      hour <= 23
        ? hour
        : DEFAULT_NOTIFY_HOUR,
    zone: typeof zone === 'string' && zone !== '' ? zone : null,
  };
}

/** The local date to claim when `now` falls in the person's chosen hour, else null. */
export function getDigestDay(now: number, settings: DigestSettings) {
  const clock = getLocalClock(now, settings.zone);
  return clock.hour === settings.hour ? clock.date : null;
}

export const claimPath = (uid: string, date: string) =>
  `apps/runway/server/${uid}/notified/needsHome_${date}`;
