import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader, type SealedReader } from '@apps/runway/security';
import type {
  BillSealed,
  EnvelopeSealed,
  GoalSealed,
  GroupSealed,
  OpenVersion,
  Pairing,
  PayLineSealed,
  PlanItemDoc,
  PlanVersionDoc,
  RunwayEncryption,
  SourceSealed,
} from '@apps/runway/types';
import { normalizeFunding } from '@apps/runway/utils/fundingText';
import { readHeldReleasedOn } from '@apps/runway/engine/endings';

/** A version written before pairings existed has none. */
const normalizePairings = (pairings: Pairing[] | undefined): Pairing[] =>
  pairings ?? [];

const planPath = (uid: string, name: string) =>
  collection(db, 'apps', 'runway', 'plans', uid, name);

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

/** A kind this build does not read yet is left out rather than failing the whole plan. */
async function openVersion(
  version: PlanVersionDoc,
  read: SealedReader,
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
    const payload = await read<Partial<SourceSealed> & { name: string }>(
      version.sealed,
    );
    return {
      ...base,
      kind: 'source',
      payload: { ...payload, pairings: normalizePairings(payload.pairings) },
    };
  }
  if (version.kind === 'payLine') {
    const payload = await read<
      Omit<PayLineSealed, 'pairings'> & { pairings?: Pairing[] }
    >(version.sealed);
    return {
      ...base,
      kind: 'payLine',
      payload: { ...payload, pairings: normalizePairings(payload.pairings) },
    };
  }
  if (version.kind === 'envelope') {
    const payload = await read<EnvelopeSealed>(version.sealed);
    return {
      ...base,
      kind: 'envelope',
      payload: { ...payload, funding: normalizeFunding(payload.funding) },
    };
  }
  if (version.kind === 'bill') {
    const payload = await read<
      Omit<BillSealed, 'groupId'> & { groupId?: string | null }
    >(version.sealed);
    return {
      ...base,
      kind: 'bill',
      payload: { ...payload, groupId: payload.groupId ?? null },
    };
  }
  if (version.kind === 'group') {
    const payload = await read<GroupSealed>(version.sealed);
    return {
      ...base,
      kind: 'group',
      payload: {
        ...payload,
        startingPriority: payload.startingPriority ?? null,
      },
    };
  }
  if (version.kind === 'goal') {
    const payload = await read<GoalSealed>(version.sealed);
    return {
      ...base,
      kind: 'goal',
      payload: { ...payload, funding: normalizeFunding(payload.funding) },
    };
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
            heldReleasedOn: readHeldReleasedOn(data),
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
  const read = createSealedReader(encryption);

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
              read,
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
