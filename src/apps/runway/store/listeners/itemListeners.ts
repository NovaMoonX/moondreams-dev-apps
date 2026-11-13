import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import {
  createSealedReader,
  openJson,
  type SealedReader,
} from '@apps/runway/security';
import type {
  BillSealed,
  EnvelopeSealed,
  GoalSealed,
  HorizonStored,
  Cents,
  GroupSealed,
  MatchSealed,
  OpenVersion,
  Pairing,
  PayLineSealed,
  PlanItemDoc,
  PlanVersionDoc,
  RunwayEncryption,
  SourceSealed,
} from '@apps/runway/types';
import { readHorizon } from '@apps/runway/engine/horizon';
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
    const payload = await read<
      Omit<EnvelopeSealed, 'groupId' | 'maxCents' | 'spillTo'> & {
        groupId?: string | null;
        maxCents?: Cents | null;
        spillTo?: string[] | null;
      }
    >(version.sealed);
    return {
      ...base,
      kind: 'envelope',
      payload: {
        ...payload,
        funding: normalizeFunding(payload.funding),
        maxCents: payload.maxCents ?? null,
        groupId: payload.groupId ?? null,
        spillTo: payload.spillTo ?? [],
      },
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
        envelopePriority:
          payload.envelopePriority === undefined
            ? (payload.startingPriority ?? null)
            : payload.envelopePriority,
        goalPriority: payload.goalPriority ?? null,
        emoji: payload.emoji ?? null,
      },
    };
  }
  if (version.kind === 'goal') {
    const payload = await read<
      Omit<GoalSealed, 'groupId'> & { groupId?: string | null }
    >(version.sealed);
    return {
      ...base,
      kind: 'goal',
      payload: {
        ...payload,
        funding: normalizeFunding(payload.funding),
        groupId: payload.groupId ?? null,
      },
    };
  }
  if (version.kind === 'horizon') {
    const payload = await read<HorizonStored>(version.sealed);
    return { ...base, kind: 'horizon', payload: readHorizon(payload) };
  }
  return null;
}

/** The merchant names each bill has learned, opened from its header; a header that does not open learns nothing. */
async function openMatchKeys(
  headers: readonly Partial<PlanItemDoc>[],
  encryption: RunwayEncryption,
): Promise<Record<string, string[]>> {
  const opened = await Promise.all(
    headers.flatMap((header) =>
      header.id && header.matchSealed
        ? [
            openJson<MatchSealed>(header.matchSealed, encryption)
              .then((payload): [string, string[]] => [
                header.id as string,
                Array.isArray(payload.merchantKeys) ? payload.merchantKeys : [],
              ])
              .catch((): [string, string[]] => [header.id as string, []]),
          ]
        : [],
    ),
  );
  return Object.fromEntries(opened.filter(([, keys]) => keys.length > 0));
}

export function startItemsListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (items: PlanItemDoc[]) => void,
  onMatchKeys: (keys: Record<string, string[]>) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const stop = onSnapshot(
    planPath(uid, 'items'),
    (snapshot) => {
      const headers = snapshot.docs.map((entry) => ({
        ...(entry.data() as Partial<PlanItemDoc>),
        id: entry.id,
      }));
      onChange(
        headers.map((data) => ({
          id: data.id,
          kind: data.kind as PlanItemDoc['kind'],
          parentId: data.parentId ?? null,
          createdAt: data.createdAt ?? 0,
          endedAt: data.endedAt ?? null,
          archivedAt: data.archivedAt ?? null,
          heldReleasedOn: readHeldReleasedOn(data),
          becameItemId: data.becameItemId ?? null,
        })),
      );
      sequence.latest += 1;
      const mine = sequence.latest;
      void openMatchKeys(headers, encryption).then((keys) => {
        if (mine === sequence.latest) onMatchKeys(keys);
      });
    },
    (error) => onError(toError(error)),
  );
  return () => {
    sequence.latest += 1;
    stop();
  };
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
