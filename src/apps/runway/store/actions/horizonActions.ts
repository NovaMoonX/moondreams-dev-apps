import { doc, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils/idUtils';

import { sealJson } from '@apps/runway/security';
import type {
  ChangeDoc,
  ChangeSealed,
  HorizonSealed,
  PlanItemDoc,
  PlanVersionDoc,
  RunwayEncryption,
} from '@apps/runway/types';

const planDoc = (uid: string, collectionName: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, collectionName, id);

export interface AddHorizonInput {
  horizon: HorizonSealed;
  /** The first day this item is in the plan. */
  startDate: number;
}

/**
 * Adds a Horizon item as a header, a first version and one change entry in a single batch. Items
 * and versions are created and never updated; nothing is written to `days`.
 */
export async function addHorizon(
  uid: string,
  encryption: RunwayEncryption,
  { horizon, startDate }: AddHorizonInput,
): Promise<{ horizonId: string }> {
  const now = Date.now();
  const horizonId = generateUuid();
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

  const batch = writeBatch(db);
  batch.set(planDoc(uid, 'items', horizonId), header);
  batch.set(planDoc(uid, 'versions', version.id), version);
  batch.set(planDoc(uid, 'changes', changeId), change);
  await batch.commit();

  return { horizonId };
}
