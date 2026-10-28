import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { openJson } from '@apps/runway/security';
import type {
  BillSealed,
  EnvelopeSealed,
  OpenVersion,
  PayLineSealed,
  PlanItemDoc,
  PlanVersionDoc,
  RunwayEncryption,
  SourceSealed,
} from '@apps/runway/types';

const planPath = (uid: string, name: string) =>
  collection(db, 'apps', 'runway', 'plans', uid, name);

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

/** A kind this build does not read yet is left out rather than failing the whole plan. */
async function openVersion(
  version: PlanVersionDoc,
  encryption: RunwayEncryption,
): Promise<OpenVersion | null> {
  const base = {
    id: version.id,
    itemId: version.itemId,
    createdAt: version.createdAt,
    effectiveFrom: version.effectiveFrom,
    effectiveUntil: version.effectiveUntil ?? null,
    changeId: version.changeId,
  };
  if (version.kind === 'source') {
    const payload = await openJson<SourceSealed>(version.sealed, encryption);
    return { ...base, kind: 'source', payload };
  }
  if (version.kind === 'payLine') {
    const payload = await openJson<PayLineSealed>(version.sealed, encryption);
    return { ...base, kind: 'payLine', payload };
  }
  if (version.kind === 'envelope') {
    const payload = await openJson<EnvelopeSealed>(version.sealed, encryption);
    return { ...base, kind: 'envelope', payload };
  }
  if (version.kind === 'bill') {
    const payload = await openJson<BillSealed>(version.sealed, encryption);
    return { ...base, kind: 'bill', payload };
  }
  return null;
}

export function startItemsListener(
  uid: string,
  onChange: (items: PlanItemDoc[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const stop = onSnapshot(
    planPath(uid, 'items'),
    (snapshot) =>
      onChange(
        snapshot.docs.map((entry) => {
          const data = entry.data() as Partial<PlanItemDoc>;
          return {
            id: entry.id,
            kind: data.kind as PlanItemDoc['kind'],
            parentId: data.parentId ?? null,
            createdAt: data.createdAt ?? 0,
            endedAt: data.endedAt ?? null,
            archivedAt: data.archivedAt ?? null,
          };
        }),
      ),
    (error) => onError(toError(error)),
  );
  return stop;
}

/** Each snapshot is opened before it is delivered; a slow open never overwrites a newer snapshot or lands after the listener stopped. */
export function startVersionsListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (versions: OpenVersion[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };

  const stop = onSnapshot(
    planPath(uid, 'versions'),
    async (snapshot) => {
      sequence.latest += 1;
      const mine = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map((entry) =>
            openVersion(
              { ...(entry.data() as PlanVersionDoc), id: entry.id },
              encryption,
            ),
          ),
        );
        if (mine === sequence.latest) {
          onChange(opened.filter((version) => version !== null));
        }
      } catch (error) {
        if (mine === sequence.latest) onError(toError(error));
      }
    },
    (error) => onError(toError(error)),
  );

  return () => {
    sequence.latest += 1;
    stop();
  };
}
