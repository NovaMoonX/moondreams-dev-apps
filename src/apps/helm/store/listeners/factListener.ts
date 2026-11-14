import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { FACTS_LIMIT } from '@apps/helm/constants';
import type { Fact, FactSealed, OpenFact } from '@apps/helm/types';
import { readPrivacy } from '@apps/helm/utils/privacy';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your facts did not open.');

/** A fact that won't open is left out: with no words there is nothing to show. */
async function openFact(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenFact[]> {
  const data = entry.data() as Partial<Fact>;
  if (!data.sealed) return [];
  try {
    const payload = await read<Partial<FactSealed>>(data.sealed);
    if (typeof payload.statement !== 'string') return [];
    return [
      {
        id: entry.id,
        status: data.status ?? 'inferred',
        stated: data.stated ?? 'nomosInferred',
        kind: data.kind ?? 'world',
        occurredOn: data.occurredOn ?? null,
        sourceCaptureId: data.sourceCaptureId ?? null,
        sourceExecutionId: data.sourceExecutionId ?? null,
        sourceConnection: data.sourceConnection ?? null,
        aboutField: data.aboutField ?? null,
        whoIds: data.whoIds ?? [],
        placeIds: data.placeIds ?? [],
        projectIds: data.projectIds ?? [],
        syncedIds: data.syncedIds ?? [],
        subjectIds: data.subjectIds ?? [],
        keptOverSource: data.keptOverSource ?? null,
        supersedesId: data.supersedesId ?? null,
        supersededById: data.supersededById ?? null,
        supersededAt: data.supersededAt ?? null,
        disputedWithId: data.disputedWithId ?? null,
        createdAt: data.createdAt ?? 0,
        privacy: readPrivacy(data.privacy),
        confirmedAt: data.confirmedAt ?? null,
        lastEditedAt: data.lastEditedAt ?? null,
        statement: payload.statement,
        quote: typeof payload.quote === 'string' ? payload.quote : null,
        topic: typeof payload.topic === 'string' ? payload.topic : null,
        value: typeof payload.value === 'string' ? payload.value : null,
        privateMark: payload.privateMark ?? null,
        isPrivacyCleared: payload.isPrivacyCleared ?? false,
      },
    ];
  } catch {
    return [];
  }
}

/** The confirmed, inferred and superseded facts (a superseded one only for "Was … until …"), newest first, so the cap drops the oldest. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startFactsListener(
  uid: string,
  read: SealedReader,
  onChange: (facts: OpenFact[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'facts'),
      where('status', 'in', ['confirmed', 'inferred', 'superseded']),
      orderBy('createdAt', 'desc'),
      limit(FACTS_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openFact(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened.flat().sort((a, b) => b.createdAt - a.createdAt));
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
