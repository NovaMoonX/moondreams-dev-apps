import { deleteDoc, doc, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { sealJson } from '@apps/runway/security';
import type {
  MemoryDoc,
  MemorySealed,
  OpenMemory,
  PayerMemorySealed,
  RouteMemorySealed,
  RunwayEncryption,
} from '@apps/runway/types';

const memoryRef = (uid: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'memories', id);

const isSameRoute = (memory: OpenMemory, route: RouteMemorySealed) =>
  memory.kind === 'route' &&
  memory.fromAccountId === route.fromAccountId &&
  memory.toAccountId === route.toAccountId &&
  memory.toCardId === route.toCardId;

/** Remembers a move the person paired by hand, unless it is already remembered; resolves with the new memory's id, or null when none was written. */
export async function rememberRoute(
  uid: string,
  encryption: RunwayEncryption,
  memories: readonly OpenMemory[],
  route: Omit<RouteMemorySealed, 'kind'>,
): Promise<string | null> {
  const payload: RouteMemorySealed = {
    kind: 'route',
    fromAccountId: route.fromAccountId,
    toAccountId: route.toAccountId,
    toCardId: route.toCardId,
  };
  if (memories.some((memory) => isSameRoute(memory, payload))) return null;
  // One id per route: a second quick pairing before the listener catches up is refused as an update.
  const id = `route_${payload.fromAccountId}_${payload.toCardId === null ? payload.toAccountId : `card_${payload.toCardId}`}`;
  const now = Date.now();
  await writeBatch(db)
    .set(memoryRef(uid, id), {
      id,
      createdAt: now,
      updatedAt: now,
      sealed: await sealJson(payload satisfies MemorySealed, encryption),
    } satisfies MemoryDoc)
    .commit();
  return id;
}

/** Remembers a payer the person linked to a pay line by hand. The same payer on another pay line replaces the older memory in one batch. Resolves with the new memory's id, or null when none was written. */
export async function rememberPayer(
  uid: string,
  encryption: RunwayEncryption,
  memories: readonly OpenMemory[],
  payer: Omit<PayerMemorySealed, 'kind'>,
): Promise<string | null> {
  const payload: PayerMemorySealed = {
    kind: 'payer',
    merchantKey: payer.merchantKey,
    merchantName: payer.merchantName,
    payLineId: payer.payLineId,
  };
  const same = memories.filter(
    (memory) =>
      memory.kind === 'payer' && memory.merchantKey === payload.merchantKey,
  );
  if (
    same.some(
      (memory) =>
        memory.kind === 'payer' && memory.payLineId === payload.payLineId,
    )
  ) {
    return null;
  }
  const id = generateUuid();
  const now = Date.now();
  const batch = writeBatch(db);
  same.forEach((memory) => batch.delete(memoryRef(uid, memory.id)));
  batch.set(memoryRef(uid, id), {
    id,
    createdAt: now,
    updatedAt: now,
    sealed: await sealJson(payload satisfies MemorySealed, encryption),
  } satisfies MemoryDoc);
  await batch.commit();
  return id;
}

/** Forgets one memory; matches that ask today ask again. */
export const forgetMemory = (uid: string, id: string) =>
  deleteDoc(memoryRef(uid, id));
