// Where the person and their people are: the order of sources, nearby, time-zone spans, the away-zone offer, phone readings and ability offers.
// Run under two zones: the engine reads date-only days in UTC, never the machine's zone.
import assert from 'node:assert/strict';

import {
  NEARBY_KM,
  NEAR_NOW_MS,
  distanceKm,
  formatAwayLine,
  isNearby,
  keepCurrentAway,
  nearestKnownCity,
  readAbilityOffer,
  readAwayZoneOffer,
  readNearNow,
  readWhereabouts,
  readZoneFor,
  zonesDiffer,
  type AwaySpanLike,
  type City,
  type KnownCity,
  type WhereInput,
} from '../../src/apps/helm/engine/whereabouts.ts';

const DAY_MS = 86_400_000;
const day = (year: number, month: number, date: number) =>
  Date.UTC(year, month - 1, date);

const city = (
  name: string,
  latitude: number,
  longitude: number,
  timezone: string | null,
): City => ({
  name,
  region: null,
  country: null,
  latitude,
  longitude,
  timezone,
});

const SEATTLE = city('Seattle', 47.606, -122.332, 'America/Los_Angeles');
const PORTLAND = city('Portland', 45.523, -122.676, 'America/Los_Angeles');
const LISBON = city('Lisbon', 38.722, -9.139, 'Europe/Lisbon');
const LA = 'America/Los_Angeles';

const span = (
  id: string,
  at: City,
  from: number,
  to: number,
  extra: Partial<AwaySpanLike> = {},
): AwaySpanLike => ({
  id,
  city: at,
  from,
  to,
  label: null,
  source: 'said',
  zoneOffered: false,
  ...extra,
});

const NO_INPUT: WhereInput = {
  dayKey: '2026-11-14',
  home: null,
  homeSource: null,
  away: [],
  trips: [],
  awayEvents: [],
  currentPlaceCity: null,
  knownCities: [],
};

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

test('nothing known reads as null', () => {
  assert.equal(readWhereabouts(NO_INPUT), null);
});

test('a stated away beats a trip beats a calendar day beats a said place beats home', () => {
  const full: WhereInput = {
    ...NO_INPUT,
    home: SEATTLE,
    homeSource: 'page',
    away: [span('a1', PORTLAND, day(2026, 11, 13), day(2026, 11, 15))],
    trips: [
      { cityName: 'Lisbon', from: day(2026, 11, 10), to: day(2026, 11, 20) },
    ],
    awayEvents: [{ cityName: 'Tacoma', dayKey: '2026-11-14' }],
    currentPlaceCity: 'Leavenworth',
    knownCities: [LISBON],
  };
  const read = (input: WhereInput) => readWhereabouts(input);
  assert.deepEqual(
    [read(full)?.city.name, read(full)?.source, read(full)?.awayId],
    ['Portland', 'said', 'a1'],
  );
  const noAway = { ...full, away: [] };
  assert.deepEqual(
    [read(noAway)?.city.name, read(noAway)?.source, read(noAway)?.until],
    ['Lisbon', 'trip', day(2026, 11, 20)],
  );
  assert.equal(read(noAway)?.city.latitude, LISBON.latitude);
  const noTrip = { ...noAway, trips: [] };
  assert.deepEqual(
    [read(noTrip)?.city.name, read(noTrip)?.source],
    ['Tacoma', 'calendar'],
  );
  const noEvent = { ...noTrip, awayEvents: [] };
  assert.deepEqual(
    [read(noEvent)?.city.name, read(noEvent)?.source],
    ['Leavenworth', 'currentPlace'],
  );
  const noPlace = { ...noEvent, currentPlaceCity: null };
  assert.deepEqual(
    [read(noPlace)?.city.name, read(noPlace)?.source],
    ['Seattle', 'home'],
  );
});

test('an away on its last day still counts and the day after does not', () => {
  const input: WhereInput = {
    ...NO_INPUT,
    home: SEATTLE,
    homeSource: 'page',
    away: [span('a1', PORTLAND, day(2026, 11, 13), day(2026, 11, 15))],
  };
  assert.equal(
    readWhereabouts({ ...input, dayKey: '2026-11-15' })?.city.name,
    'Portland',
  );
  assert.equal(
    readWhereabouts({ ...input, dayKey: '2026-11-16' })?.city.name,
    'Seattle',
  );
  assert.equal(
    readWhereabouts({ ...input, dayKey: '2026-11-12' })?.city.name,
    'Seattle',
  );
});

test('the shorter of two overlapping aways wins', () => {
  const input: WhereInput = {
    ...NO_INPUT,
    away: [
      span('long', LISBON, day(2026, 11, 10), day(2026, 11, 20)),
      span('short', PORTLAND, day(2026, 11, 14), day(2026, 11, 14)),
    ],
  };
  assert.equal(readWhereabouts(input)?.awayId, 'short');
});

const KM_PER_DEGREE = (2 * Math.PI * 6371) / 360;
const onMeridian = (km: number) => ({
  name: `At ${km}`,
  latitude: 47 + km / KM_PER_DEGREE,
  longitude: -122,
  timezone: null,
});
const ORIGIN = {
  name: 'Origin',
  latitude: 47,
  longitude: -122,
  timezone: null,
};

test('two cities 49 km apart are nearby and 51 km are not', () => {
  assert.equal(NEARBY_KM, 50);
  assert.ok(Math.abs(distanceKm(ORIGIN, onMeridian(49)) - 49) < 0.01);
  assert.equal(isNearby(ORIGIN, onMeridian(49)), true);
  assert.equal(isNearby(ORIGIN, onMeridian(51)), false);
});

test('a city with no coordinates is nearby only by name, ignoring accents and case', () => {
  const named = (name: string): KnownCity => ({
    name,
    latitude: null,
    longitude: null,
    timezone: null,
  });
  assert.equal(isNearby(named('Montréal'), named(' montreal ')), true);
  assert.equal(isNearby(named('Montréal'), named('Quebec')), false);
  assert.equal(isNearby(named('Seattle'), ORIGIN), false);
  assert.equal(isNearby(named('Origin'), ORIGIN), true);
});

test('a zone span covers its days, otherwise the profile zone', () => {
  const profile = {
    timeZone: LA,
    zoneSpans: [
      { zone: 'Europe/Lisbon', from: day(2026, 12, 2), to: day(2026, 12, 9) },
    ],
  };
  assert.equal(readZoneFor('2026-12-02', profile), 'Europe/Lisbon');
  assert.equal(readZoneFor('2026-12-09', profile), 'Europe/Lisbon');
  assert.equal(readZoneFor('2026-12-01', profile), LA);
  assert.equal(readZoneFor('2026-12-10', profile), LA);
});

test('zones differ by offset on any day of the span', () => {
  assert.equal(
    zonesDiffer('Europe/Lisbon', LA, day(2026, 12, 2), day(2026, 12, 9)),
    true,
  );
  assert.equal(
    zonesDiffer(
      'America/Los_Angeles',
      'America/Los_Angeles',
      day(2026, 12, 2),
      day(2026, 12, 9),
    ),
    false,
  );
  assert.equal(
    zonesDiffer(
      'America/Los_Angeles',
      'America/Phoenix',
      day(2026, 7, 1),
      day(2026, 7, 5),
    ),
    false,
  );
  assert.equal(
    zonesDiffer(
      'America/Los_Angeles',
      'America/Phoenix',
      day(2026, 1, 1),
      day(2026, 1, 5),
    ),
    true,
  );
});

test('a span across a DST switch differs when one of its days does', () => {
  const phoenix = 'America/Phoenix';
  assert.equal(
    zonesDiffer(LA, phoenix, day(2026, 3, 7), day(2026, 3, 10)),
    true,
  );
  assert.equal(
    zonesDiffer(LA, phoenix, day(2026, 3, 7), day(2026, 3, 7)),
    true,
  );
  assert.equal(
    zonesDiffer(LA, phoenix, day(2026, 3, 8), day(2026, 3, 10)),
    false,
  );
});

test('an unknown zone never differs', () => {
  assert.equal(
    zonesDiffer('Not/AZone', LA, day(2026, 12, 2), day(2026, 12, 9)),
    false,
  );
});

const LISBON_SPAN = span('lisbon', LISBON, day(2026, 12, 2), day(2026, 12, 9));

test('the away-zone offer names the city and the days', () => {
  const offer = readAwayZoneOffer(LISBON_SPAN, LA, []);
  assert.deepEqual(offer, {
    awayId: 'lisbon',
    zone: 'Europe/Lisbon',
    cityName: 'Lisbon',
    from: day(2026, 12, 2),
    to: day(2026, 12, 9),
    label: 'Use Lisbon time Dec 2–9',
  });
});

test('the away-zone offer is never made twice, without a zone, or for the same clock', () => {
  assert.equal(
    readAwayZoneOffer({ ...LISBON_SPAN, zoneOffered: true }, LA, []),
    null,
  );
  assert.equal(
    readAwayZoneOffer(LISBON_SPAN, LA, [{ awayId: 'lisbon' }]),
    null,
  );
  assert.notEqual(
    readAwayZoneOffer(LISBON_SPAN, LA, [{ awayId: 'other' }]),
    null,
  );
  assert.equal(
    readAwayZoneOffer(
      span('p', PORTLAND, day(2026, 11, 13), day(2026, 11, 15)),
      LA,
      [],
    ),
    null,
  );
  assert.equal(
    readAwayZoneOffer(
      span(
        'n',
        city('Somewhere', 1, 1, null),
        day(2026, 12, 2),
        day(2026, 12, 9),
      ),
      LA,
      [],
    ),
    null,
  );
});

test('the away line says until once it started and the days before', () => {
  assert.equal(
    formatAwayLine(
      span('a', PORTLAND, day(2026, 11, 13), day(2026, 11, 15)),
      '2026-11-14',
    ),
    'In Portland · until Sun, Nov 15',
  );
  assert.equal(
    formatAwayLine(LISBON_SPAN, '2026-11-14'),
    'In Lisbon · Dec 2–9',
  );
  assert.equal(
    formatAwayLine(
      span('a', PORTLAND, day(2026, 11, 14), day(2026, 11, 15)),
      '2026-11-14',
    ),
    'In Portland · until Sun, Nov 15',
  );
});

test('an away that ended before today drops, one ending today stays', () => {
  const spans = [
    span('ended', PORTLAND, day(2026, 11, 10), day(2026, 11, 13)),
    span('today', PORTLAND, day(2026, 11, 12), day(2026, 11, 14)),
    span('ahead', LISBON, day(2026, 12, 2), day(2026, 12, 9)),
  ];
  assert.deepEqual(
    keepCurrentAway(spans, '2026-11-14').map((entry) => entry.id),
    ['today', 'ahead'],
  );
});

test('the nearest known city is within 50 km, else null', () => {
  const known: KnownCity[] = [
    { name: 'Far', ...{ latitude: 10, longitude: 10, timezone: null } },
    { name: 'Name only', latitude: null, longitude: null, timezone: null },
    onMeridian(30),
    onMeridian(10),
  ];
  assert.equal(nearestKnownCity(ORIGIN, known)?.name, 'At 10');
  assert.equal(nearestKnownCity(ORIGIN, [onMeridian(51)]), null);
  assert.equal(nearestKnownCity(ORIGIN, [onMeridian(49)])?.name, 'At 49');
});

test('a city read from a point carries only the known city, never the point', () => {
  const found = nearestKnownCity(ORIGIN, [onMeridian(10)]);
  assert.deepEqual(Object.keys(found ?? {}).sort(), [
    'latitude',
    'longitude',
    'name',
    'timezone',
  ]);
  assert.equal(found?.latitude, onMeridian(10).latitude);
});

test('a phone reading lapses at six hours', () => {
  const reading = { city: 'Seattle', at: 1_000_000, point: null };
  const sixHours = 6 * 60 * 60 * 1000;
  assert.equal(NEAR_NOW_MS, sixHours);
  assert.equal(readNearNow(reading, reading.at + sixHours - 60_000), reading);
  assert.equal(readNearNow(reading, reading.at + sixHours), null);
  assert.equal(readNearNow(null, reading.at), null);
});

const NOW = day(2026, 11, 14);
const offer = (extra: Partial<Parameters<typeof readAbilityOffer>[0]> = {}) =>
  readAbilityOffer({
    level: 'city',
    setting: 'off',
    permission: 'prompt',
    offers: [],
    now: NOW,
    ...extra,
  });

test('a location offer needs a level above the setting on a phone that can', () => {
  assert.equal(offer(), 'offer');
  assert.equal(offer({ level: 'city', setting: 'city' }), null);
  assert.equal(offer({ level: 'city', setting: 'precise' }), null);
  assert.equal(offer({ level: 'precise', setting: 'city' }), 'offer');
  assert.equal(offer({ permission: 'unsupported' }), null);
  assert.equal(offer({ permission: 'denied' }), 'settingsLine');
});

test('a Not now holds an offer back for four weeks, for that level only', () => {
  const declined = (daysAgo: number, level: 'city' | 'precise' = 'city') => [
    { level, declinedAt: NOW - daysAgo * DAY_MS },
  ];
  assert.equal(offer({ offers: declined(27) }), null);
  assert.equal(offer({ offers: declined(29) }), 'offer');
  assert.equal(offer({ offers: declined(1, 'precise') }), 'offer');
});

test('the phone-location rule: only the device writes a point, and only at Precise', () => {
  // The device rule (point null unless Precise, rounded to 3 decimals) lives in the device write; the engine only ever returns a known city.
  assert.equal(readNearNow({ at: NOW, point: null }, NOW)?.point, null);
});

const failures: string[] = [];
for (const [name, run] of tests) {
  try {
    run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
  }
}
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
