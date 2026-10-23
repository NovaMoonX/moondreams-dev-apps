import { doc, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils/idUtils';
import { formatCents } from '@/utils/moneyUtils';
import { formatDateUTC } from '@/utils/formatUtils';

import { formatRange } from '@apps/runway/utils/rangeText';
import { describeBillTiming } from '@apps/runway/utils/billText';
import { describeFunding } from '@apps/runway/utils/fundingText';
import { sealJson } from '@apps/runway/security';
import type {
  BillSealed,
  ChangeDoc,
  ChangeSealed,
  EnvelopeSealed,
  GoalSealed,
  Ending,
  MoneyRange,
  Pairing,
  PayLineSealed,
  PlanItemDoc,
  PlanVersionDoc,
  RunwayEncryption,
  Schedule,
  SourceSealed,
  Stance,
} from '@apps/runway/types';

export interface CreateIncomeInput {
  /** An existing source to add the pay line to; null names a new one. */
  sourceId: string | null;
  sourceName: string;
  payLineName: string;
  amount: MoneyRange;
  stanceOverride: Stance | null;
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
  amount,
  startDate,
}: CreateIncomeInput) =>
  `Added ${payLineName} from ${sourceName}, ${formatRange(amount)}, from ${formatDateUTC(startDate)}.`;

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

  const sourcePayload: SourceSealed = {
    name: input.sourceName,
    pairings: [],
  };
  const payLinePayload: PayLineSealed = {
    name: input.payLineName,
    schedule: input.schedule,
    amount: input.amount,
    ending: input.ending,
    stanceOverride: input.stanceOverride,
    pairings: [],
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

export interface CreateEnvelopeInput {
  envelope: EnvelopeSealed;
  /** The first day this envelope is in the plan. */
  startDate: number;
}

/**
 * Adds an envelope as a header, a first version and one change entry in a single batch. Items and
 * versions are created and never updated; nothing is written to `days`.
 */
export async function createEnvelope(
  uid: string,
  encryption: RunwayEncryption,
  { envelope, startDate }: CreateEnvelopeInput,
): Promise<{ envelopeId: string }> {
  const now = Date.now();
  const envelopeId = generateUuid();
  const changeId = generateUuid();
  const changePayload: ChangeSealed = {
    summary: `Added ${envelope.name}, ${describeFunding(envelope.funding)}.`,
  };

  const [envelopeSealed, changeSealed] = await Promise.all([
    sealJson(envelope, encryption),
    sealJson(changePayload, encryption),
  ]);

  const header: PlanItemDoc = {
    id: envelopeId,
    kind: 'envelope',
    parentId: null,
    createdAt: now,
    endedAt: null,
    archivedAt: null,
  };
  const version: PlanVersionDoc = {
    id: generateUuid(),
    itemId: envelopeId,
    kind: 'envelope',
    createdAt: now,
    effectiveFrom: startDate,
    effectiveUntil: null,
    changeId,
    sealed: envelopeSealed,
  };
  const change: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: startDate,
    itemIds: [envelopeId],
    sealed: changeSealed,
  };

  const batch = writeBatch(db);
  batch.set(itemPath(uid, 'items', envelopeId), header);
  batch.set(itemPath(uid, 'versions', version.id), version);
  batch.set(itemPath(uid, 'changes', changeId), change);
  await batch.commit();

  return { envelopeId };
}

export interface CreateBillInput {
  bill: BillSealed;
  /** The first day this bill is in the plan. */
  startDate: number;
}

/**
 * Adds a bill as a header, a first version and one change entry in a single batch. Items and
 * versions are created and never updated; nothing is written to `days`.
 */
export async function createBill(
  uid: string,
  encryption: RunwayEncryption,
  { bill, startDate }: CreateBillInput,
): Promise<{ billId: string }> {
  const now = Date.now();
  const billId = generateUuid();
  const changeId = generateUuid();
  const changePayload: ChangeSealed = {
    summary: `Added ${bill.name}, ${formatRange(bill.amount)}. ${describeBillTiming(bill.timing.schedule)}.`,
  };

  const [billSealed, changeSealed] = await Promise.all([
    sealJson(bill, encryption),
    sealJson(changePayload, encryption),
  ]);

  const header: PlanItemDoc = {
    id: billId,
    kind: 'bill',
    parentId: null,
    createdAt: now,
    endedAt: null,
    archivedAt: null,
  };
  const version: PlanVersionDoc = {
    id: generateUuid(),
    itemId: billId,
    kind: 'bill',
    createdAt: now,
    effectiveFrom: startDate,
    effectiveUntil: null,
    changeId,
    sealed: billSealed,
  };
  const change: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: startDate,
    itemIds: [billId],
    sealed: changeSealed,
  };

  const batch = writeBatch(db);
  batch.set(itemPath(uid, 'items', billId), header);
  batch.set(itemPath(uid, 'versions', version.id), version);
  batch.set(itemPath(uid, 'changes', changeId), change);
  await batch.commit();

  return { billId };
}

export interface CreateGoalInput {
  goal: GoalSealed;
  /** The first day this goal is in the plan. */
  startDate: number;
}

/**
 * Adds a goal as a header, a first version and one change entry in a single batch. Items and
 * versions are created and never updated; nothing is written to `days`.
 */
export async function createGoal(
  uid: string,
  encryption: RunwayEncryption,
  { goal, startDate }: CreateGoalInput,
): Promise<{ goalId: string }> {
  const now = Date.now();
  const goalId = generateUuid();
  const changeId = generateUuid();
  const dateText =
    goal.targetDate === null ? '' : ` by ${formatDateUTC(goal.targetDate)}`;
  const changePayload: ChangeSealed = {
    summary: `Added ${goal.name}, ${formatCents(goal.targetCents)}${dateText}, ${describeFunding(goal.funding)}.`,
  };

  const [goalSealed, changeSealed] = await Promise.all([
    sealJson(goal, encryption),
    sealJson(changePayload, encryption),
  ]);

  const header: PlanItemDoc = {
    id: goalId,
    kind: 'goal',
    parentId: null,
    createdAt: now,
    endedAt: null,
    archivedAt: null,
  };
  const version: PlanVersionDoc = {
    id: generateUuid(),
    itemId: goalId,
    kind: 'goal',
    createdAt: now,
    effectiveFrom: startDate,
    effectiveUntil: null,
    changeId,
    sealed: goalSealed,
  };
  const change: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: startDate,
    itemIds: [goalId],
    sealed: changeSealed,
  };

  const batch = writeBatch(db);
  batch.set(itemPath(uid, 'items', goalId), header);
  batch.set(itemPath(uid, 'versions', version.id), version);
  batch.set(itemPath(uid, 'changes', changeId), change);
  await batch.commit();

  return { goalId };
}

export interface SetPairingsInput {
  itemId: string;
  kind: 'source' | 'payLine';
  /** The version in force; its payload is copied with the new pairings. */
  current: SourceSealed | PayLineSealed;
  pairings: Pairing[];
  name: string;
  /** The first day the new set applies. */
  startDate: number;
}

/** Saves a source's or pay line's pairings as a new version of it plus one change entry in a single batch; the old version stays as it was. */
export async function setPairings(
  uid: string,
  encryption: RunwayEncryption,
  input: SetPairingsInput,
): Promise<void> {
  const now = Date.now();
  const changeId = generateUuid();
  const changePayload: ChangeSealed = {
    summary: `Changed what ${input.name} funds, from ${formatDateUTC(input.startDate)}.`,
  };
  const [versionSealed, changeSealed] = await Promise.all([
    sealJson({ ...input.current, pairings: input.pairings }, encryption),
    sealJson(changePayload, encryption),
  ]);
  const version: PlanVersionDoc = {
    id: generateUuid(),
    itemId: input.itemId,
    kind: input.kind,
    createdAt: now,
    effectiveFrom: input.startDate,
    effectiveUntil: null,
    changeId,
    sealed: versionSealed,
  };
  const change: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: input.startDate,
    itemIds: [input.itemId],
    sealed: changeSealed,
  };
  const batch = writeBatch(db);
  batch.set(itemPath(uid, 'versions', version.id), version);
  batch.set(itemPath(uid, 'changes', changeId), change);
  await batch.commit();
}
