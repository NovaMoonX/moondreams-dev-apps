import { doc, runTransaction, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils/idUtils';
import { formatCents } from '@/utils/moneyUtils';
import { formatDateUTC } from '@/utils/formatUtils';

import { formatRange } from '@apps/runway/utils/rangeText';
import { describeBillTiming } from '@apps/runway/utils/billText';
import { describeFunding } from '@apps/runway/utils/fundingText';
import { sealJson } from '@apps/runway/security';
import type { ItemPayload } from '@apps/runway/utils/changeText';
import type {
  BillSealed,
  ChangeDoc,
  ChangeSealed,
  EnvelopeSealed,
  GoalSealed,
  Ending,
  MoneyRange,
  ItemKind,
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

export interface ChangeItemInput {
  itemId: string;
  kind: ItemKind;
  /** The item's whole payload from `effectiveFrom` on, not a diff. */
  payload: ItemPayload;
  /** What changed, from and to, in the change entry's words. */
  summary: string;
  note: string | null;
  effectiveFrom: number;
  /** The first day the change no longer covers, so the version before it returns; null lasts until superseded. */
  effectiveUntil?: number | null;
}

/**
 * Saves an edit as a new whole-payload version of the item plus one change entry in a single batch.
 * Nothing already written is touched, so an earlier day stays as it was and a second device's edit of
 * the same item is kept beside this one, the later `createdAt` winning where both cover a date.
 */
export async function changeItem(
  uid: string,
  encryption: RunwayEncryption,
  input: ChangeItemInput,
): Promise<void> {
  const now = Date.now();
  const changeId = generateUuid();
  const changePayload: ChangeSealed = {
    summary: input.summary,
    note: input.note,
  };
  const [versionSealed, changeSealed] = await Promise.all([
    sealJson(input.payload, encryption),
    sealJson(changePayload, encryption),
  ]);
  const version: PlanVersionDoc = {
    id: generateUuid(),
    itemId: input.itemId,
    kind: input.kind,
    createdAt: now,
    effectiveFrom: input.effectiveFrom,
    effectiveUntil: input.effectiveUntil ?? null,
    changeId,
    sealed: versionSealed,
  };
  const change: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: input.effectiveFrom,
    itemIds: [input.itemId],
    sealed: changeSealed,
  };
  const batch = writeBatch(db);
  batch.set(itemPath(uid, 'versions', version.id), version);
  batch.set(itemPath(uid, 'changes', changeId), change);
  await batch.commit();
}

export interface EndItemInput {
  itemId: string;
  /** The last day the item counts; it is gone from the day after. */
  endedOn: number;
  summary: string;
  note: string | null;
}

/**
 * Ends an item: its header's `endedAt` goes from null to a date once, with the entry that says why,
 * in one transaction. The entry's id is `ended_${itemId}`, so a second device ending it too, or the
 * sweep reaching a natural ending, finds the header already ended and writes nothing. Versions are
 * untouched, so every earlier day still resolves.
 */
export async function endItem(
  uid: string,
  encryption: RunwayEncryption,
  input: EndItemInput,
): Promise<boolean> {
  const changeId = `ended_${input.itemId}`;
  const sealed = await sealJson<ChangeSealed>(
    { summary: input.summary, note: input.note },
    encryption,
  );
  const headerRef = itemPath(uid, 'items', input.itemId);
  const written = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(headerRef);
    if (!snapshot.exists()) throw new Error('This item no longer exists.');
    const header = snapshot.data() as Partial<PlanItemDoc>;
    if ((header.endedAt ?? null) !== null) return false;
    const entry: ChangeDoc = {
      id: changeId,
      kind: 'ended',
      createdAt: Date.now(),
      effectiveFrom: input.endedOn,
      itemIds: [input.itemId],
      sealed,
    };
    transaction.update(headerRef, { endedAt: input.endedOn });
    transaction.set(itemPath(uid, 'changes', changeId), entry);
    return true;
  });
  return written;
}

export interface ArchiveItemInput {
  itemId: string;
  summary: string;
  note: string | null;
}

/**
 * Archives an item: `archivedAt` is set once, from today on, so it leaves the lists and the coming
 * days while every version and every confirmed day stays as it was. Returns false when another
 * device archived it first.
 */
export async function archiveItem(
  uid: string,
  encryption: RunwayEncryption,
  input: ArchiveItemInput,
  archivedAt: number,
): Promise<boolean> {
  const changeId = generateUuid();
  const sealed = await sealJson<ChangeSealed>(
    { summary: input.summary, note: input.note },
    encryption,
  );
  const headerRef = itemPath(uid, 'items', input.itemId);
  const written = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(headerRef);
    if (!snapshot.exists()) throw new Error('This item no longer exists.');
    const header = snapshot.data() as Partial<PlanItemDoc>;
    if ((header.archivedAt ?? null) !== null) return false;
    const entry: ChangeDoc = {
      id: changeId,
      kind: 'planChange',
      createdAt: Date.now(),
      effectiveFrom: archivedAt,
      itemIds: [input.itemId],
      sealed,
    };
    transaction.update(headerRef, { archivedAt });
    transaction.set(itemPath(uid, 'changes', changeId), entry);
    return true;
  });
  return written;
}

export interface SetGoalStateInput {
  itemId: string;
  /** The goal as it stands now; the new version is this with only `state` changed. */
  goal: GoalSealed;
  state: GoalSealed['state'];
  note: string | null;
  effectiveFrom: number;
}

/** Pauses or resumes a goal as a new version: money stops or starts from the date, the balance and history are untouched. */
export async function setGoalState(
  uid: string,
  encryption: RunwayEncryption,
  input: SetGoalStateInput,
): Promise<void> {
  const isPaused = input.state === 'paused';
  await changeItem(uid, encryption, {
    itemId: input.itemId,
    kind: 'goal',
    payload: { ...input.goal, state: input.state },
    summary: `${input.goal.name}: ${isPaused ? 'saving paused' : 'saving started again'}, from ${formatDateUTC(input.effectiveFrom)}.`,
    note: input.note,
    effectiveFrom: input.effectiveFrom,
  });
}
