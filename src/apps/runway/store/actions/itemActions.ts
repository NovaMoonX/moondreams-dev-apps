import { doc, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils/idUtils';
import { formatCents } from '@/utils/moneyUtils';
import { formatDateUTC } from '@/utils/formatUtils';

import { sealJson } from '@apps/runway/security';
import type {
  ChangeDoc,
  ChangeSealed,
  Ending,
  PayLineSealed,
  PlanItemDoc,
  PlanVersionDoc,
  RunwayEncryption,
  Schedule,
  SourceSealed,
} from '@apps/runway/types';

export interface CreateIncomeInput {
  /** An existing source to add the pay line to; null names a new one. */
  sourceId: string | null;
  sourceName: string;
  payLineName: string;
  amountCents: number;
  schedule: Schedule;
  ending: Ending;
  /** The first day this income is in the plan. */
  startDate: number;
}

const itemPath = (uid: string, collectionName: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, collectionName, id);

const getSummary = ({
  sourceName,
  payLineName,
  amountCents,
  startDate,
}: CreateIncomeInput) =>
  `Added ${payLineName} from ${sourceName}, ${formatCents(amountCents)}, from ${formatDateUTC(startDate)}.`;

/**
 * Adds a pay line, and its source when it is new, as headers, first versions and one change entry in a
 * single batch. Items and versions are created and never updated; nothing is written to `days`.
 */
export async function createIncome(
  uid: string,
  encryption: RunwayEncryption,
  input: CreateIncomeInput,
): Promise<{ sourceId: string; payLineId: string }> {
  const now = Date.now();
  const sourceId = input.sourceId ?? generateUuid();
  const payLineId = generateUuid();
  const changeId = generateUuid();
  const itemIds = input.sourceId ? [payLineId] : [sourceId, payLineId];

  const sourcePayload: SourceSealed = { name: input.sourceName };
  const payLinePayload: PayLineSealed = {
    name: input.payLineName,
    schedule: input.schedule,
    amount: { lowCents: input.amountCents, highCents: input.amountCents },
    ending: input.ending,
  };
  const changePayload: ChangeSealed = { summary: getSummary(input) };

  const [sourceSealed, payLineSealed, changeSealed] = await Promise.all([
    input.sourceId
      ? Promise.resolve(null)
      : sealJson(sourcePayload, encryption),
    sealJson(payLinePayload, encryption),
    sealJson(changePayload, encryption),
  ]);

  const header = (
    id: string,
    kind: 'source' | 'payLine',
    parentId: string | null,
  ): PlanItemDoc => ({
    id,
    kind,
    parentId,
    createdAt: now,
    endedAt: null,
    archivedAt: null,
  });
  const firstVersion = (
    itemId: string,
    kind: 'source' | 'payLine',
    sealed: PlanVersionDoc['sealed'],
  ): PlanVersionDoc => ({
    id: generateUuid(),
    itemId,
    kind,
    createdAt: now,
    effectiveFrom: input.startDate,
    effectiveUntil: null,
    changeId,
    sealed,
  });
  const change: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: input.startDate,
    itemIds,
    sealed: changeSealed,
  };

  const batch = writeBatch(db);
  if (sourceSealed) {
    const sourceHeader = header(sourceId, 'source', null);
    const sourceVersion = firstVersion(sourceId, 'source', sourceSealed);
    batch.set(itemPath(uid, 'items', sourceId), sourceHeader);
    batch.set(itemPath(uid, 'versions', sourceVersion.id), sourceVersion);
  }
  const payLineVersion = firstVersion(payLineId, 'payLine', payLineSealed);
  batch.set(
    itemPath(uid, 'items', payLineId),
    header(payLineId, 'payLine', sourceId),
  );
  batch.set(itemPath(uid, 'versions', payLineVersion.id), payLineVersion);
  batch.set(itemPath(uid, 'changes', changeId), change);
  await batch.commit();

  return { sourceId, payLineId };
}
