import { collection, doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { sealJson } from '@apps/helm/security';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import type {
  Fact,
  FactSealed,
  OpenFact,
  SyncedRecord,
} from '@apps/helm/types';

export type CalendarRightResult =
  | { kind: 'done'; newFactId: string; previous: PreviousFact }
  | { kind: 'changed' }
  | { kind: 'offline' };

/** What the answered fact held before, so Undo puts it back exactly. */
export interface PreviousFact {
  factId: string;
  lastEditedAt: number | null;
}

const factsOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'facts');

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

/** Says the calendar is right: one confirmed fact takes the place of the inferred one, which is kept as superseded. */
export async function confirmCalendarRight(
  uid: string,
  input: {
    fact: OpenFact;
    record: SyncedRecord;
    statement: string;
    value: string;
  },
): Promise<CalendarRightResult> {
  if (!navigator.onLine) return { kind: 'offline' };
  const { fact, record, statement, value } = input;
  const encryption = await getHelmEncryption(uid);
  const facts = factsOf(uid);
  const oldRef = doc(facts, fact.id);
  const newRef = doc(facts);
  const sealed = await sealJson<FactSealed>(
    {
      statement,
      quote: null,
      topic: fact.topic,
      value,
      privateMark: null,
      isPrivacyCleared: false,
    },
    encryption,
  );
  const now = Date.now();
  try {
    return await runTransaction(db, async (transaction) => {
      const current = await transaction.get(oldRef);
      const data = current.data() as Partial<Fact> | undefined;
      if (data?.status !== 'inferred') return { kind: 'changed' as const };
      const confirmed: Omit<Fact, 'sealed'> = {
        status: 'confirmed',
        stated: 'personCorrected',
        kind: fact.kind,
        occurredOn: fact.occurredOn,
        sourceCaptureId: null,
        sourceExecutionId: null,
        sourceConnection: null,
        aboutField: fact.aboutField,
        whoIds: fact.whoIds,
        placeIds: fact.placeIds,
        projectIds: fact.projectIds,
        syncedIds: [record.id],
        subjectIds: fact.subjectIds,
        keptOverSource: {
          syncedId: record.id,
          contentHash: record.contentHash ?? '',
        },
        supersedesId: fact.id,
        supersededById: null,
        supersededAt: null,
        disputedWithId: null,
        privacy: 'ordinary',
        createdAt: now,
        confirmedAt: now,
        lastEditedAt: null,
      };
      transaction.set(newRef, { ...confirmed, sealed });
      transaction.update(oldRef, {
        status: 'superseded',
        supersededById: newRef.id,
        supersededAt: now,
        lastEditedAt: now,
      });
      return {
        kind: 'done' as const,
        newFactId: newRef.id,
        previous: {
          factId: fact.id,
          lastEditedAt: data.lastEditedAt ?? null,
        },
      };
    });
  } catch (error) {
    if (isUnavailable(error)) return { kind: 'offline' };
    throw error;
  }
}

/** Takes "The calendar is right" back: the confirmed fact goes and the inferred one is as it was. */
export async function undoCalendarRight(
  uid: string,
  newFactId: string,
  previous: PreviousFact,
): Promise<'done' | 'offline'> {
  if (!navigator.onLine) return 'offline';
  const facts = factsOf(uid);
  const oldRef = doc(facts, previous.factId);
  try {
    await runTransaction(db, async (transaction) => {
      const old = await transaction.get(oldRef);
      transaction.delete(doc(facts, newFactId));
      if (old.exists()) {
        transaction.update(oldRef, {
          status: 'inferred',
          supersededById: null,
          supersededAt: null,
          lastEditedAt: previous.lastEditedAt,
        });
      }
    });
    return 'done';
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}
