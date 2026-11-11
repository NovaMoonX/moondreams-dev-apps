import {
  collection,
  onSnapshot,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import type { StyleProfile, StyleSealed } from '@apps/helm/types';

/** A style profile after its sealed notes are opened; one that would not open keeps `isUnreadable` and no notes. */
export interface OpenStyle extends Omit<StyleProfile, 'sealed'>, StyleSealed {
  id: string;
  isUnreadable: boolean;
}

const toError = (error: unknown) =>
  error instanceof Error
    ? error
    : new Error('Your writing notes did not open.');

const toTraits = (value: unknown): StyleSealed['traits'] =>
  typeof value !== 'object' || value === null
    ? {}
    : Object.fromEntries(
        Object.entries(value).flatMap(([key, trait]) => {
          const entry = trait as Partial<StyleSealed['traits'][string]> | null;
          return typeof entry?.text === 'string'
            ? [
                [
                  key,
                  {
                    text: entry.text,
                    isPersonSet: entry.isPersonSet === true,
                    exampleCount:
                      typeof entry.exampleCount === 'number'
                        ? entry.exampleCount
                        : 0,
                  },
                ],
              ]
            : [];
        }),
      );

async function openStyle(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenStyle> {
  const data = entry.data() as Partial<StyleProfile>;
  const base = {
    id: entry.id,
    scope: data.scope ?? 'general',
    audienceWhoId: data.audienceWhoId ?? null,
    learnedFrom: data.learnedFrom ?? [],
    sampleCount: data.sampleCount ?? 0,
    personEditedAt: data.personEditedAt ?? null,
    createdAt: data.createdAt ?? 0,
    lastEditedAt: data.lastEditedAt ?? null,
  } as const;
  try {
    if (!data.sealed) throw new Error('This profile has no sealed notes.');
    const payload = await read<Partial<StyleSealed>>(data.sealed);
    return {
      ...base,
      label: typeof payload.label === 'string' ? payload.label : '',
      traits: toTraits(payload.traits),
      avoid: Array.isArray(payload.avoid)
        ? payload.avoid.filter(
            (line): line is string => typeof line === 'string',
          )
        : [],
      isUnreadable: false,
    };
  } catch {
    return { ...base, label: '', traits: {}, avoid: [], isUnreadable: true };
  }
}

/** The few style profiles, all of them; a slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startStyleListener(
  uid: string,
  read: SealedReader,
  onChange: (style: OpenStyle[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    collection(db, 'apps', 'helm', 'users', uid, 'style'),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openStyle(entry, read)),
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
