import type { KnownCity } from '@apps/helm/engine/whereabouts';
import type { OpenWho, SyncedRecord } from '@apps/helm/types';

const DAY_MS = 24 * 60 * 60 * 1000;

const toDay = (at: number) => Math.floor(at / DAY_MS) * DAY_MS;

/** Waypoint trips copied in: the city name and the days they cover, as date-only values. */
export const toTrips = (records: SyncedRecord[]) =>
  records.flatMap((record) =>
    record.kind === 'trip' &&
    record.connectionEndedAt === null &&
    record.startAt !== null &&
    record.sealed.placeLabel
      ? [
          {
            cityName: record.sealed.placeLabel,
            from: toDay(record.startAt),
            to: toDay(record.endAt ?? record.startAt),
          },
        ]
      : [],
  );

/** Every city a who's home or away names, with its coordinates. */
export const toKnownCities = (people: OpenWho[]): KnownCity[] =>
  people.flatMap((who) =>
    who.isUnreadable
      ? []
      : [who.home, ...(who.away ?? []).map((span) => span.city)].flatMap(
          (city) =>
            city
              ? [
                  {
                    name: city.name,
                    latitude: city.latitude,
                    longitude: city.longitude,
                    timezone: city.timezone,
                  },
                ]
              : [],
        ),
  );
