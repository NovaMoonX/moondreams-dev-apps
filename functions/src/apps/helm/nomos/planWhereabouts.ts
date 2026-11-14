import type { SealedPayload } from '../../../appKeys/seal.js';
import { isPrivateInEffect, readPrivacyFacts } from '../privacy.js';
import { toPrivateMark } from './contextPeople.js';
import type { Effect, EffectRef } from './executeCommands.js';
import type { SetWhereaboutsCommand } from './commands.js';
import { getDayIn, toKnownZone } from './spoken.js';
import { toComparable } from '../../../vendor/optionMatchUtils.js';
import {
  MAX_AWAY_SPANS,
  formatAwayLine,
  keepCurrentAway,
  readAbilityOffer,
  readAwayZoneOffer,
  readZoneFor,
  readWhereabouts,
  type AwaySpanLike,
  type AwayZoneOffer,
  type City,
  type KnownCity,
  type ZoneSpanLike,
} from './whereabouts.js';

const PRIVATE_PERSON_LABEL = 'a private person';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ZONE_SPANS_READ = 10;

type Level = 'city' | 'precise';
type Setting = 'off' | Level;
type Permission = 'granted' | 'prompt' | 'denied' | 'unsupported';

export interface WhereProfile {
  timeZone: string;
  zoneSpans: ZoneSpanLike[];
  phoneLocation: Setting;
  abilityOffers: { ability: 'location'; level: Level; declinedAt: number }[];
  currentPlaceSaidAt: number | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isLevel = (value: unknown): value is Level =>
  value === 'city' || value === 'precise';

const toCity = (value: unknown): City | null => {
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    !isNumber(value.latitude) ||
    !isNumber(value.longitude)
  ) {
    return null;
  }
  return {
    name: value.name,
    region: typeof value.region === 'string' ? value.region : null,
    country: typeof value.country === 'string' ? value.country : null,
    latitude: value.latitude,
    longitude: value.longitude,
    timezone: typeof value.timezone === 'string' ? value.timezone : null,
  };
};

const toAwaySpan = (value: unknown): AwaySpanLike | null => {
  if (!isRecord(value)) return null;
  const city = toCity(value.city);
  if (
    !city ||
    typeof value.id !== 'string' ||
    !isNumber(value.from) ||
    !isNumber(value.to)
  ) {
    return null;
  }
  return {
    id: value.id,
    city,
    from: value.from,
    to: value.to,
    label: typeof value.label === 'string' ? value.label : null,
    source: value.source === 'page' ? 'page' : 'said',
    zoneOffered: value.zoneOffered === true,
  };
};

/** The profile's whereabouts fields, a profile from before them reading as off, no spans and no declines. */
export const readWhereProfile = (
  data: Record<string, unknown> | undefined,
): WhereProfile => {
  const spans: unknown = data?.zoneSpans;
  const offers: unknown = data?.abilityOffers;
  const place = data?.currentPlace;
  return {
    timeZone: typeof data?.timeZone === 'string' ? data.timeZone : 'UTC',
    zoneSpans: (Array.isArray(spans) ? spans : [])
      .flatMap((entry): ZoneSpanLike[] =>
        isRecord(entry) &&
        typeof entry.zone === 'string' &&
        isNumber(entry.from) &&
        isNumber(entry.to) &&
        typeof entry.awayId === 'string'
          ? [
              {
                zone: entry.zone,
                from: entry.from,
                to: entry.to,
                awayId: entry.awayId,
              },
            ]
          : [],
      )
      .slice(0, MAX_ZONE_SPANS_READ),
    phoneLocation: isLevel(data?.phoneLocation) ? data.phoneLocation : 'off',
    abilityOffers: (Array.isArray(offers) ? offers : []).flatMap(
      (entry): WhereProfile['abilityOffers'] =>
        isRecord(entry) &&
        entry.ability === 'location' &&
        isLevel(entry.level) &&
        isNumber(entry.declinedAt)
          ? [
              {
                ability: 'location',
                level: entry.level,
                declinedAt: entry.declinedAt,
              },
            ]
          : [],
    ),
    currentPlaceSaidAt:
      isRecord(place) && isNumber(place.saidAt) ? place.saidAt : null,
  };
};

export interface WhoWhere {
  home: City | null;
  homeSource: 'said' | 'page' | null;
  away: AwaySpanLike[];
}

/** A who's stated places from its opened words; a record sealed before them has none. */
export const readWhoWhere = (
  words: Record<string, unknown> | null,
): WhoWhere => ({
  home: toCity(words?.home),
  homeSource:
    words?.homeSource === 'said' || words?.homeSource === 'page'
      ? words.homeSource
      : null,
  away: (Array.isArray(words?.away) ? (words.away as unknown[]) : []).flatMap(
    (entry) => toAwaySpan(entry) ?? [],
  ),
});

export interface ResolvedWhereabouts {
  command: SetWhereaboutsCommand;
  city: City | null;
}

export interface WhereaboutsPlan {
  whoRewrites: { id: string; data: Record<string, unknown> }[];
  effectRefs: EffectRef[];
  effects: Effect[];
  lines: string[];
  notKept: string[];
  linkedWhoIds: string[];
  isPrivate: boolean;
  awayZoneOffer: AwayZoneOffer | null;
}

export const NOT_AWAY_LINE = "You weren't marked as away, so nothing changed";

export const WHERE_NOT_WITH_NAME_LINE =
  'Where they are was left as it was, since their name was fixed in the same message. Say it again to change it';

export const NO_WHO_LINE =
  "Couldn't tell whose whereabouts to change, so nothing changed";

export const buildAwayFullLine = (cityName: string) =>
  `Away spans are full, so ${cityName} was left out`;

export const buildWhichCityLine = (cityName: string) =>
  `Which ${cityName} is it? Say the city and state or country`;

/** Plans each stated home, away or back as an update to the who's sealed words, with the earlier values kept so Undo restores them. A city that could not be found writes nothing and asks which. */
export function planWhereabouts(input: {
  commands: ResolvedWhereabouts[];
  selfWhoId: string | null;
  whos: Map<string, Record<string, unknown> | null>;
  profile: Pick<WhereProfile, 'timeZone' | 'zoneSpans'>;
  todayKey: string;
  now: number;
  isUnattended: boolean;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): WhereaboutsPlan {
  const todayAt = Date.parse(`${input.todayKey}T00:00:00Z`);
  const empty = {
    words: new Map<string, Record<string, unknown>>(),
    plan: {
      whoRewrites: [],
      effectRefs: [],
      effects: [],
      lines: [],
      notKept: [],
      linkedWhoIds: [],
      isPrivate: false,
      awayZoneOffer: null,
    } as WhereaboutsPlan,
  };
  const { plan, words } = input.commands.reduce((acc, entry) => {
    const { command, city } = entry;
    const id = command.whoId ?? input.selfWhoId;
    const opened = id ? (acc.words.get(id) ?? input.whos.get(id)) : null;
    if (!id || !opened || typeof opened.name !== 'string') {
      return {
        ...acc,
        plan: { ...acc.plan, notKept: [...acc.plan.notKept, NO_WHO_LINE] },
      };
    }
    if (command.change !== 'back' && !city) {
      return {
        ...acc,
        plan: {
          ...acc.plan,
          notKept: [
            ...acc.plan.notKept,
            buildWhichCityLine(command.cityName ?? 'that'),
          ],
        },
      };
    }
    const before = readWhoWhere(opened);
    const isPrivate = isPrivateInEffect(
      readPrivacyFacts({
        privateMark: toPrivateMark(opened.privateMark),
        isPrivacyCleared: opened.isPrivacyCleared === true,
      }),
    );
    const name =
      input.isUnattended && isPrivate ? PRIVATE_PERSON_LABEL : opened.name;
    const label = { 'sealed.name': opened.name };
    const subject = command.whoId === null ? null : name;
    const withSubject = (text: string) =>
      subject === null
        ? text
        : `${subject} ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    const keep = (
      fields: Record<string, unknown>,
      written: Record<string, unknown>,
      previous: Record<string, unknown>,
      line: string,
      awayZoneOffer: AwayZoneOffer | null,
    ) => ({
      words: new Map(acc.words).set(id, { ...opened, ...fields }),
      plan: {
        ...acc.plan,
        effectRefs: [
          ...acc.plan.effectRefs,
          { op: 'update', collection: 'who', docId: id } as EffectRef,
        ],
        effects: [
          ...acc.plan.effects,
          {
            written: { ...written, ...label },
            previous: { ...previous, ...label },
          },
        ],
        lines: [...acc.plan.lines, line],
        linkedWhoIds: [...new Set([...acc.plan.linkedWhoIds, id])],
        isPrivate: acc.plan.isPrivate || isPrivate,
        awayZoneOffer: acc.plan.awayZoneOffer ?? awayZoneOffer,
      },
    });
    if (command.change === 'home' && city) {
      return keep(
        { home: city, homeSource: 'said' },
        { 'sealed.home': city, 'sealed.homeSource': 'said' },
        {
          'sealed.home': before.home,
          'sealed.homeSource': before.homeSource,
        },
        withSubject(`Lives in ${city.name}`),
        null,
      );
    }
    if (command.change === 'back') {
      const ended = before.away.filter(
        (span) => span.from <= todayAt && todayAt <= span.to,
      );
      if (ended.length === 0) {
        return {
          ...acc,
          plan: {
            ...acc.plan,
            notKept: [...acc.plan.notKept, NOT_AWAY_LINE],
          },
        };
      }
      const next = before.away.filter((span) => !ended.includes(span));
      return keep(
        { away: next },
        { 'sealed.away': next },
        { 'sealed.away': before.away },
        'Back home',
        null,
      );
    }
    if (!city || command.from === null || command.to === null) return acc;
    const draft: AwaySpanLike = {
      id: input.newId(),
      city,
      from: command.from,
      to: command.to,
      label: command.label,
      source: 'said',
      zoneOffered: false,
    };
    const offer =
      command.whoId === null
        ? readAwayZoneOffer(
            draft,
            input.profile.timeZone,
            input.profile.zoneSpans,
          )
        : null;
    const span = offer ? { ...draft, zoneOffered: true } : draft;
    const others = keepCurrentAway(before.away, input.todayKey).filter(
      (entry) => entry.from !== span.from || entry.to !== span.to,
    );
    const ordered = [...others, span].sort((a, b) => a.from - b.from);
    const next = ordered.slice(0, MAX_AWAY_SPANS);
    const dropped = ordered.slice(MAX_AWAY_SPANS)[0];
    const droppedLine = dropped ? buildAwayFullLine(dropped.city.name) : null;
    if (dropped === span) {
      return {
        ...acc,
        plan: {
          ...acc.plan,
          notKept: [...acc.plan.notKept, buildAwayFullLine(span.city.name)],
        },
      };
    }
    const kept = keep(
      { away: next },
      { 'sealed.away': next },
      { 'sealed.away': before.away },
      withSubject(formatAwayLine(span, input.todayKey)),
      offer,
    );
    return droppedLine
      ? {
          ...kept,
          plan: { ...kept.plan, notKept: [...kept.plan.notKept, droppedLine] },
        }
      : kept;
  }, empty);
  return {
    ...plan,
    whoRewrites: [...words.entries()].flatMap(([id, opened]) =>
      plan.linkedWhoIds.includes(id)
        ? [
            {
              id,
              data: { sealed: input.seal(opened), lastEditedAt: input.now },
            },
          ]
        : [],
    ),
  };
}

/** The offer the model asked for, kept only when code allows it: above the setting, on a phone that can, not under a recent Not now. */
export const decideAbilityOffer = (input: {
  asked: { ability: 'location'; level: Level } | null;
  device: { setting: Setting; permission: Permission } | null;
  profile: Pick<WhereProfile, 'abilityOffers'>;
  now: number;
}): {
  ability: 'location';
  level: Level;
  mode: 'offer' | 'settingsLine';
} | null => {
  if (!input.asked || !input.device) return null;
  const mode = readAbilityOffer({
    level: input.asked.level,
    setting: input.device.setting,
    permission: input.device.permission,
    offers: input.profile.abilityOffers,
    now: input.now,
  });
  return mode ? { ability: 'location', level: input.asked.level, mode } : null;
};

/** The device's readable report of this phone's location setting; null for a capture from before it, or one that does not read. */
export const readCaptureAbilities = (
  value: unknown,
): { location: { setting: Setting; permission: Permission } } | null => {
  const location = isRecord(value) ? value.location : null;
  if (!isRecord(location)) return null;
  const { setting, permission } = location;
  return (setting === 'off' || isLevel(setting)) &&
    (permission === 'granted' ||
      permission === 'prompt' ||
      permission === 'denied' ||
      permission === 'unsupported')
    ? { location: { setting, permission } }
    : null;
};

export interface WhereTrip {
  cityName: string;
  from: number;
  to: number;
}

const toDayText = (at: number) => new Date(at).toISOString().slice(0, 10);

const toKnown = (city: City | null): KnownCity[] =>
  city
    ? [
        {
          name: city.name,
          latitude: city.latitude,
          longitude: city.longitude,
          timezone: city.timezone,
        },
      ]
    : [];

const describeAway = (span: AwaySpanLike) => ({
  city: span.city.name,
  from: toDayText(span.from),
  to: toDayText(span.to),
  ...(span.label ? { label: span.label } : {}),
});

/** Where the person is on a day, as names only: never a coordinate. */
const describeDay = (
  dayKey: string,
  self: WhoWhere,
  trips: WhereTrip[],
  currentPlaceCity: string | null,
) => {
  const read = readWhereabouts({
    dayKey,
    home: self.home,
    homeSource: self.homeSource,
    away: self.away,
    trips,
    awayEvents: [],
    currentPlaceCity,
    knownCities: [
      ...toKnown(self.home),
      ...self.away.flatMap((span) => toKnown(span.city)),
    ],
  });
  return read
    ? {
        date: dayKey,
        city: read.city.name,
        source: read.source,
        ...(read.until === null ? {} : { until: toDayText(read.until) }),
      }
    : null;
};

/** The block's content: today's place, the place on a day the reading names, and the home and away lines of each who the turn names. */
export function describeWhereabouts(input: {
  todayKey: string;
  namedDayKeys: string[];
  self: WhoWhere;
  trips: WhereTrip[];
  named: { name: string; where: WhoWhere }[];
}) {
  const today = describeDay(input.todayKey, input.self, input.trips, null);
  const days = input.namedDayKeys
    .filter((dayKey) => dayKey !== input.todayKey)
    .slice(0, 3)
    .flatMap(
      (dayKey) => describeDay(dayKey, input.self, input.trips, null) ?? [],
    );
  const people = input.named.flatMap(({ name, where }) =>
    where.home || where.away.length > 0
      ? [
          {
            name,
            ...(where.home ? { home: where.home.name } : {}),
            ...(where.away.length > 0
              ? { away: where.away.map(describeAway) }
              : {}),
          },
        ]
      : [],
  );
  return today || days.length > 0 || people.length > 0
    ? {
        today,
        ...(days.length > 0 ? { onDays: days } : {}),
        ...(people.length > 0 ? { people } : {}),
      }
    : null;
}

export const isNamedText = (text: string, names: string[]) => {
  const words = ` ${toComparable(text)} `;
  return names.some((name) => {
    const comparable = toComparable(name);
    return comparable !== '' && words.includes(` ${comparable} `);
  });
};

export const tripsFromCopies = (
  copies: {
    startAt: number | null;
    endAt: number | null;
    placeLabel: string | null;
  }[],
): WhereTrip[] =>
  copies.flatMap((copy) =>
    copy.startAt !== null && copy.placeLabel
      ? [
          {
            cityName: copy.placeLabel,
            from: Math.floor(copy.startAt / DAY_MS) * DAY_MS,
            to: Math.floor((copy.endAt ?? copy.startAt) / DAY_MS) * DAY_MS,
          },
        ]
      : [],
  );

/** The ids of a who's current away spans, or null when its words are not read (the zone check then leaves spans unfiltered). */
export const toAwayIds = (words: Record<string, unknown> | null) =>
  words ? readWhoWhere(words).away.map((span) => span.id) : null;

/** The zone the day of an instant follows: home's, or a chosen away span's for a day it covers while its away span still stands. */
export const toTurnZone = (
  data: Record<string, unknown> | undefined,
  at: number,
  awayIds: string[] | null = null,
) => {
  const profile = readWhereProfile(data);
  const homeZone = toKnownZone(profile.timeZone);
  return readZoneFor(
    new Date(getDayIn(at, homeZone)).toISOString().slice(0, 10),
    { ...profile, timeZone: homeZone },
    awayIds,
  );
};
