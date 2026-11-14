// Generated from src/apps/helm/engine/whereabouts.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
export const NEARBY_KM = 50;
export const NEAR_NOW_MS = 6 * 60 * 60 * 1000;
export const ABILITY_OFFER_WAIT_MS = 28 * 24 * 60 * 60 * 1000;
export const MAX_AWAY_SPANS = 5;
export const MAX_ZONE_SPANS = 10;

/** The shape of a city from the shared city search. */
export interface City {
  name: string;
  region: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EARTH_RADIUS_KM = 6371;
const MAX_ZONE_DAYS = 62;

export type WhereSource =
  'said' | 'page' | 'trip' | 'calendar' | 'currentPlace' | 'home';

export interface KnownCity {
  name: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

export interface AwaySpanLike {
  id: string;
  city: City;
  from: number;
  to: number;
  label: string | null;
  source: 'said' | 'page';
  zoneOffered: boolean;
}

export interface Whereabouts {
  city: KnownCity;
  source: WhereSource;
  /** The last day (date-only) of an away span, trip or calendar day; null for home and a said place. */
  until: number | null;
  awayId: string | null;
}

export interface WhereInput {
  dayKey: string;
  home: City | null;
  homeSource: 'said' | 'page' | null;
  away: AwaySpanLike[];
  trips: { cityName: string; from: number; to: number }[];
  awayEvents: { cityName: string; dayKey: string }[];
  currentPlaceCity: string | null;
  knownCities: KnownCity[];
}

export interface ZoneSpanLike {
  zone: string;
  from: number;
  to: number;
  awayId: string;
}

export interface AwayZoneOffer {
  awayId: string;
  zone: string;
  cityName: string;
  from: number;
  to: number;
  label: string;
}

const toDayMs = (dayKey: string) => Date.parse(`${dayKey}T00:00:00Z`);

const foldName = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) *
      Math.cos(toRadians(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const hasPoint = (
  city: KnownCity,
): city is KnownCity & { latitude: number; longitude: number } =>
  typeof city.latitude === 'number' && typeof city.longitude === 'number';

/** Within NEARBY_KM when both have coordinates; otherwise only the same name. */
export function isNearby(a: KnownCity, b: KnownCity): boolean {
  if (hasPoint(a) && hasPoint(b)) return distanceKm(a, b) <= NEARBY_KM;
  return foldName(a.name) === foldName(b.name);
}

const toKnownCity = (city: City): KnownCity => ({
  name: city.name,
  latitude: city.latitude,
  longitude: city.longitude,
  timezone: city.timezone,
});

const knownByName = (name: string, known: KnownCity[]): KnownCity =>
  known.find((city) => foldName(city.name) === foldName(name)) ?? {
    name,
    latitude: null,
    longitude: null,
    timezone: null,
  };

const covers = (span: { from: number; to: number }, day: number) =>
  span.from <= day && day <= span.to;

/** Where the person (or a who) is on a day: a stated away, then a trip, then a marked calendar day, then a said place today, then home. */
export function readWhereabouts(input: WhereInput): Whereabouts | null {
  const day = toDayMs(input.dayKey);
  const away = input.away
    .filter((span) => covers(span, day))
    .sort((a, b) => a.to - a.from - (b.to - b.from))[0];
  if (away) {
    return {
      city: toKnownCity(away.city),
      source: away.source,
      until: away.to,
      awayId: away.id,
    };
  }
  const trip = input.trips.find((span) => covers(span, day));
  if (trip) {
    return {
      city: knownByName(trip.cityName, input.knownCities),
      source: 'trip',
      until: trip.to,
      awayId: null,
    };
  }
  const event = input.awayEvents.find((entry) => entry.dayKey === input.dayKey);
  if (event) {
    return {
      city: knownByName(event.cityName, input.knownCities),
      source: 'calendar',
      until: day,
      awayId: null,
    };
  }
  if (input.currentPlaceCity) {
    return {
      city: knownByName(input.currentPlaceCity, input.knownCities),
      source: 'currentPlace',
      until: null,
      awayId: null,
    };
  }
  if (input.home) {
    return {
      city: toKnownCity(input.home),
      source: 'home',
      until: null,
      awayId: null,
    };
  }
  return null;
}

/** The zone a day's clock follows: a chosen away span's, else home's. With `awayIds`, a zone span counts only while its away span is still in the list. */
export function readZoneFor(
  dayKey: string,
  profile: {
    timeZone: string;
    zoneSpans: { zone: string; from: number; to: number; awayId?: string }[];
  },
  awayIds: string[] | null = null,
): string {
  const day = toDayMs(dayKey);
  return (
    profile.zoneSpans.find(
      (span) =>
        covers(span, day) &&
        (awayIds === null ||
          (span.awayId !== undefined && awayIds.includes(span.awayId))),
    )?.zone ?? profile.timeZone
  );
}

const offsetMinutes = (zone: string, at: number): number | null => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(at));
    const read = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    const asUtc = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      read('hour'),
      read('minute'),
    );
    return Math.round((asUtc - at) / 60000);
  } catch {
    return null;
  }
};

/** Whether two zones' offsets differ on any day of a date-only span. */
export function zonesDiffer(
  zoneA: string,
  zoneB: string,
  from: number,
  to: number,
): boolean {
  const days = Math.min(MAX_ZONE_DAYS, Math.floor((to - from) / DAY_MS) + 1);
  return Array.from(
    { length: Math.max(days, 1) },
    (_, index) => from + index * DAY_MS + DAY_MS / 2,
  ).some((noon) => {
    const a = offsetMinutes(zoneA, noon);
    const b = offsetMinutes(zoneB, noon);
    return a !== null && b !== null && a !== b;
  });
}

const monthDay = (at: number) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(new Date(at));

const weekdayMonthDay = (at: number) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(at));

/** "Dec 2–9", "Nov 30–Dec 2", or "Dec 2" for one day. */
export function formatSpanDays(from: number, to: number): string {
  if (from === to) return monthDay(from);
  const sameMonth =
    new Date(from).getUTCMonth() === new Date(to).getUTCMonth() &&
    new Date(from).getUTCFullYear() === new Date(to).getUTCFullYear();
  return sameMonth
    ? `${monthDay(from)}–${new Date(to).getUTCDate()}`
    : `${monthDay(from)}–${monthDay(to)}`;
}

/** The offer to follow an away city's clock, once per span, only when its offsets differ from home's. */
export function readAwayZoneOffer(
  span: AwaySpanLike,
  homeZone: string,
  zoneSpans: { awayId: string }[],
): AwayZoneOffer | null {
  const zone = span.city.timezone;
  if (span.zoneOffered || !zone) return null;
  if (zoneSpans.some((entry) => entry.awayId === span.id)) return null;
  if (!zonesDiffer(zone, homeZone, span.from, span.to)) return null;
  return {
    awayId: span.id,
    zone,
    cityName: span.city.name,
    from: span.from,
    to: span.to,
    label: `Use ${span.city.name} time ${formatSpanDays(span.from, span.to)}`,
  };
}

/** "In Portland · until Sun, Nov 15" once it has started, "In Lisbon · Dec 2–9" before. */
export function formatAwayLine(
  span: Pick<AwaySpanLike, 'city' | 'from' | 'to'>,
  todayKey: string,
): string {
  const today = toDayMs(todayKey);
  const when =
    span.from <= today
      ? `until ${weekdayMonthDay(span.to)}`
      : formatSpanDays(span.from, span.to);
  return `In ${span.city.name} · ${when}`;
}

/** Spans still current or ahead on a day; an ended one drops on the next write. */
export function keepCurrentAway<T extends { to: number }>(
  away: T[],
  todayKey: string,
): T[] {
  const today = toDayMs(todayKey);
  return away.filter((span) => span.to >= today);
}

/** The known city within NEARBY_KM of a point, nearest first; null when none is. */
export function nearestKnownCity(
  point: { latitude: number; longitude: number },
  known: KnownCity[],
): KnownCity | null {
  return (
    known
      .filter(hasPoint)
      .map((city) => ({ city, km: distanceKm(point, city) }))
      .filter(({ km }) => km <= NEARBY_KM)
      .sort((a, b) => a.km - b.km)[0]?.city ?? null
  );
}

/** A phone reading while it still holds. */
export function readNearNow<T extends { at: number }>(
  nearNow: T | null,
  now: number,
): T | null {
  return nearNow && now - nearNow.at < NEAR_NOW_MS ? nearNow : null;
}

/** Off below City only below Precise. */
export const LEVEL_RANK = { off: 0, city: 1, precise: 2 } as const;

/** Whether an answer may carry a location offer: only above the setting, never on a phone that can't, and not within 4 weeks of a Not now. */
export function readAbilityOffer(input: {
  level: 'city' | 'precise';
  setting: 'off' | 'city' | 'precise';
  permission: 'granted' | 'prompt' | 'denied' | 'unsupported';
  offers: { level: 'city' | 'precise'; declinedAt: number }[];
  now: number;
}): 'offer' | 'settingsLine' | null {
  if (LEVEL_RANK[input.level] <= LEVEL_RANK[input.setting]) return null;
  if (input.permission === 'unsupported') return null;
  const declined = input.offers.some(
    (offer) =>
      offer.level === input.level &&
      input.now - offer.declinedAt < ABILITY_OFFER_WAIT_MS,
  );
  if (declined) return null;
  return input.permission === 'denied' ? 'settingsLine' : 'offer';
}
