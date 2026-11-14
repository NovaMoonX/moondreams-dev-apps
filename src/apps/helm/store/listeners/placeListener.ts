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

import { PLACES_LIMIT } from '@apps/helm/constants';
import type { OpenPlace, Place, PlaceSealed } from '@apps/helm/types';
import { readPrivacy } from '@apps/helm/utils/privacy';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your places did not open.');

const toText = (value: unknown) => (typeof value === 'string' ? value : null);

/** A place that won't open is kept, with no name, so the surface can say so instead of dropping it. */
async function openPlace(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenPlace> {
  const data = entry.data() as Partial<Place>;
  const base = {
    id: entry.id,
    isHome: data.isHome ?? false,
    photoMediaIds: data.photoMediaIds ?? [],
    createdBy: data.createdBy ?? 'nomos',
    executionId: data.executionId ?? null,
    createdAt: data.createdAt ?? 0,
    privacy: readPrivacy(data.privacy),
    lastEditedAt: data.lastEditedAt ?? null,
  } as const;
  try {
    if (!data.sealed) throw new Error('This place has no sealed words.');
    const payload = await read<Partial<PlaceSealed>>(data.sealed);
    return {
      ...base,
      name: toText(payload.name) ?? '',
      aliases: Array.isArray(payload.aliases)
        ? payload.aliases.filter(
            (entry): entry is string => typeof entry === 'string',
          )
        : [],
      address: toText(payload.address),
      notes: toText(payload.notes),
      privateMark: payload.privateMark ?? null,
      isPrivacyCleared: payload.isPrivacyCleared ?? false,
      isUnreadable: false,
    };
  } catch {
    return {
      ...base,
      name: '',
      aliases: [],
      address: null,
      notes: null,
      isUnreadable: true,
    };
  }
}

/** Every place the person has. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startPlacesListener(
  uid: string,
  read: SealedReader,
  onChange: (places: OpenPlace[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'places'),
      limit(PLACES_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openPlace(entry, read)),
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
