import type { City } from '@/lib/cities/types';
import {
  collection,
  limit,
  onSnapshot,
  query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { toComparable } from '@/utils/optionMatchUtils';
import { WHO_LIMIT } from '@apps/helm/constants';
import { normalizeKin } from '@apps/helm/engine/kin';
import type { OpenWho, Who, WhoSealed } from '@apps/helm/types';
import { readPrivacy } from '@apps/helm/utils/privacy';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your people did not open.');

const toTexts = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

const toUniqueTexts = (value: unknown) =>
  toTexts(value).filter(
    (entry, index, all) =>
      all.findIndex((other) => toComparable(other) === toComparable(entry)) ===
      index,
  );

const toText = (value: unknown) => (typeof value === 'string' ? value : null);

/** A who that won't open is kept, with no name, so the surface can say so instead of dropping it. */
async function openWho(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenWho> {
  const data = entry.data() as Partial<Who>;
  const base = {
    id: entry.id,
    kind: data.kind ?? 'person',
    tier: data.tier ?? 'passing',
    tierSetBy: data.tierSetBy ?? 'nomos',
    isSelf: data.isSelf ?? false,
    placeIds: data.placeIds ?? [],
    photoMediaId: data.photoMediaId ?? null,
    mediaIds: data.mediaIds ?? [],
    importedFrom: data.importedFrom ?? null,
    importedFields: data.importedFields ?? {},
    lastMentionedAt: data.lastMentionedAt ?? null,
    yearlyDateCount: data.yearlyDateCount ?? 0,
    momentCount: data.momentCount ?? 0,
    createdBy: data.createdBy ?? 'nomos',
    executionId: data.executionId ?? null,
    createdAt: data.createdAt ?? 0,
    privacy: readPrivacy(data.privacy),
    lastEditedAt: data.lastEditedAt ?? null,
  } as const;
  const empty = {
    name: '',
    aliases: [],
    kin: null,
    soundsLike: null,
    refusedAliases: null,
    relation: null,
    phone: null,
    email: null,
    notes: null,
    species: null,
    organizationKind: null,
    home: null,
    homeSource: null,
    away: null,
    nearNow: null,
  };
  try {
    if (!data.sealed) throw new Error('This person has no sealed words.');
    const payload = await read<Partial<WhoSealed>>(data.sealed);
    return {
      ...base,
      name: toText(payload.name) ?? '',
      aliases: toUniqueTexts(payload.aliases),
      kin: normalizeKin(payload.kin),
      soundsLike: payload.soundsLike ? toTexts(payload.soundsLike) : null,
      refusedAliases: payload.refusedAliases
        ? toTexts(payload.refusedAliases)
        : null,
      relation: toText(payload.relation),
      phone: toText(payload.phone),
      email: toText(payload.email),
      notes: toText(payload.notes),
      species: toText(payload.species),
      organizationKind: toText(payload.organizationKind),
      privateMark: payload.privateMark ?? null,
      isPrivacyCleared: payload.isPrivacyCleared ?? false,
      home: toCity(payload.home),
      homeSource: payload.home ? (payload.homeSource ?? 'page') : null,
      away: Array.isArray(payload.away)
        ? payload.away.flatMap((span) => {
            const city = toCity(span?.city);
            return city &&
              typeof span.from === 'number' &&
              typeof span.to === 'number'
              ? [
                  {
                    ...span,
                    city,
                    label: toText(span.label),
                    zoneOffered: span.zoneOffered ?? false,
                  },
                ]
              : [];
          })
        : null,
      nearNow: payload.nearNow ?? null,
      isUnreadable: false,
    };
  } catch {
    return {
      ...base,
      ...empty,
      isUnreadable: true,
      privateMark: null,
      isPrivacyCleared: false,
    };
  }
}

const toCity = (value: unknown): City | null => {
  if (!value || typeof value !== 'object') return null;
  const city = value as Partial<City>;
  return typeof city.name === 'string' &&
    typeof city.latitude === 'number' &&
    typeof city.longitude === 'number'
    ? {
        name: city.name,
        region: city.region ?? null,
        country: city.country ?? null,
        latitude: city.latitude,
        longitude: city.longitude,
        timezone: city.timezone ?? null,
      }
    : null;
};

/** Every who the person has. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startWhoListener(
  uid: string,
  read: SealedReader,
  onChange: (who: OpenWho[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'who'),
      limit(WHO_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openWho(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened);
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
