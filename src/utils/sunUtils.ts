import type { Coordinates } from '@/utils/geolocationUtils';

const DAY_MS = 86_400_000;
const UNIX_EPOCH_JULIAN = 2440587.5;
const J2000 = 2451545;
const RADIANS = Math.PI / 180;
const EARTH_TILT = 23.4397 * RADIANS;
// The sun's upper edge touching the horizon, refraction included.
const HORIZON = -0.833 * RADIANS;

export interface SunTimes {
  /** Epoch ms; null when the sun doesn't rise or set that day. */
  sunrise: number | null;
  sunset: number | null;
  /** With no sunrise or sunset: whether the sun stays up all day (polar day) or down (polar night). */
  isUpAllDay: boolean;
}

/** Sunrise and sunset on the local calendar day of `day` at `coordinates`, from the standard solar
 * equations (within a minute or two away from the poles). Works offline. */
export function getSunTimes(day: Date, { latitude, longitude }: Coordinates): SunTimes {
  const localNoon = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12).getTime();
  const julianNoon = localNoon / DAY_MS + UNIX_EPOCH_JULIAN;
  const cycle = Math.round(julianNoon - J2000 - 0.0009 + longitude / 360);
  const approxNoon = 0.0009 - longitude / 360 + cycle;

  const anomaly = ((357.5291 + 0.98560028 * approxNoon) % 360) * RADIANS;
  const center =
    1.9148 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly) + 0.0003 * Math.sin(3 * anomaly);
  const eclipticLongitude = ((anomaly / RADIANS + center + 180 + 102.9372) % 360) * RADIANS;
  const transit =
    J2000 + approxNoon + 0.0053 * Math.sin(anomaly) - 0.0069 * Math.sin(2 * eclipticLongitude);

  const declination = Math.asin(Math.sin(eclipticLongitude) * Math.sin(EARTH_TILT));
  const phi = latitude * RADIANS;
  const cosHourAngle =
    (Math.sin(HORIZON) - Math.sin(phi) * Math.sin(declination)) /
    (Math.cos(phi) * Math.cos(declination));

  if (cosHourAngle > 1 || cosHourAngle < -1) {
    return { sunrise: null, sunset: null, isUpAllDay: cosHourAngle < -1 };
  }

  const halfDay = Math.acos(cosHourAngle) / RADIANS / 360;
  const toEpoch = (julian: number) => Math.round((julian - UNIX_EPOCH_JULIAN) * DAY_MS);
  return {
    sunrise: toEpoch(transit - halfDay),
    sunset: toEpoch(transit + halfDay),
    isUpAllDay: false,
  };
}
