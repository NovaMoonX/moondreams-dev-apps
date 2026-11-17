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

import { GROUPING_LIMITS, readGrouping } from '@apps/helm/engine/grouping';
import type { GroupingSealed, OpenGrouping } from '@apps/helm/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your groupings did not open.');

const toTitles = (value: unknown): Record<string, string> =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

/** A grouping whose words won't open keeps its readable part, so an answered one stays held back. */
export async function openGrouping(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenGrouping | null> {
  const data = entry.data();
  const meta = readGrouping(entry.id, data);
  if (!meta) return null;
  try {
    if (!data.sealed) throw new Error('This grouping has no sealed words.');
    const payload = await read<Partial<GroupingSealed>>(data.sealed);
    return {
      ...meta,
      proposedTitle:
        typeof payload.proposedTitle === 'string'
          ? payload.proposedTitle
          : null,
      emoji: typeof payload.emoji === 'string' ? payload.emoji : null,
      titles: toTitles(payload.titles),
      isUnreadable: false,
    };
  } catch {
    return {
      ...meta,
      proposedTitle: null,
      emoji: null,
      titles: {},
      isUnreadable: true,
    };
  }
}

/** A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startGroupingsListener(
  uid: string,
  read: SealedReader,
  onChange: (groupings: OpenGrouping[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'groupings'),
      limit(GROUPING_LIMITS.records),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openGrouping(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened.filter((one): one is OpenGrouping => one !== null));
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
