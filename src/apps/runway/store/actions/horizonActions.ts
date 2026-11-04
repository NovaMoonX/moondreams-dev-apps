import { doc, runTransaction, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils/idUtils';

import { sealJson } from '@apps/runway/security';
import {
  assertPlanStarted,
  assertSourceLive,
  sealMoveLeftover,
  writeSealedMove,
  type MoveLeftoverInput,
} from '@apps/runway/store/actions/transferActions';
import type {
  ChangeDoc,
  ChangeSealed,
  HorizonSealed,
  PlanDoc,
  PlanItemDoc,
  PlanVersionDoc,
  RunwayEncryption,
} from '@apps/runway/types';

const planDoc = (uid: string, collectionName: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, collectionName, id);

export interface AddHorizonInput {
  /** Made once by the caller so a retry of the same add resolves to the same item. */
  horizonId: string;
  horizon: HorizonSealed;
  /** The first day this item is in the plan. */
  startDate: number;
  /** Money put toward the item as it is added; its target is the new item. Null puts none. */
  toward: Omit<MoveLeftoverInput, 'toId' | 'note' | 'isOutside'> | null;
}

/**
 * Adds a Horizon item as a header, a first version and one change entry in a single write: a batch,
 * or a transaction that also carries the move of money put toward it. Items and versions are created
 * and never updated; nothing is written to `days`.
 */
export async function addHorizon(
  uid: string,
  encryption: RunwayEncryption,
  { horizonId, horizon, startDate, toward }: AddHorizonInput,
): Promise<{ horizonId: string }> {
  const now = Date.now();
  const changeId = generateUuid();
  const changePayload: ChangeSealed = { summary: `Added ${horizon.name}.` };

  const [horizonSealed, changeSealed] = await Promise.all([
    sealJson(horizon, encryption),
    sealJson(changePayload, encryption),
  ]);

  const header: PlanItemDoc = {
    id: horizonId,
    kind: 'horizon',
    parentId: null,
    createdAt: now,
    endedAt: null,
    archivedAt: null,
    heldReleasedOn: null,
  };
  const version: PlanVersionDoc = {
    id: generateUuid(),
    itemId: horizonId,
    kind: 'horizon',
    createdAt: now,
    effectiveFrom: startDate,
    effectiveUntil: null,
    changeId,
    sealed: horizonSealed,
  };
  const change: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: startDate,
    itemIds: [horizonId],
    sealed: changeSealed,
  };

  if (toward === null) {
    const batch = writeBatch(db);
    batch.set(planDoc(uid, 'items', horizonId), header);
    batch.set(planDoc(uid, 'versions', version.id), version);
    batch.set(planDoc(uid, 'changes', changeId), change);
    await batch.commit();
    return { horizonId };
  }

  const move = await sealMoveLeftover(encryption, {
    ...toward,
    toId: horizonId,
    note: null,
    isOutside: false,
  });
  await runTransaction(db, async (transaction) => {
    const [plan, from, existing] = await Promise.all([
      transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
      toward.fromId === null
        ? Promise.resolve(null)
        : transaction.get(planDoc(uid, 'items', toward.fromId)),
      transaction.get(planDoc(uid, 'moves', toward.moveId)),
    ]);
    if (existing.exists()) return;
    const data = plan.data() as Partial<PlanDoc> | undefined;
    assertPlanStarted(data, move.date);
    if (from !== null) {
      assertSourceLive(from.data() as Partial<PlanItemDoc> | undefined);
    }
    transaction.set(planDoc(uid, 'items', horizonId), header);
    transaction.set(planDoc(uid, 'versions', version.id), version);
    transaction.set(planDoc(uid, 'changes', changeId), change);
    writeSealedMove(
      transaction,
      uid,
      toward.moveId,
      data,
      move,
      toward.fromId ?? horizonId,
    );
  });

  return { horizonId };
}
