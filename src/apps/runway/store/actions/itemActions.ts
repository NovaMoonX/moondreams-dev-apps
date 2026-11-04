import { doc, runTransaction, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { GROUP_WORDS } from '@apps/runway/constants';
import { generateUuid } from '@/utils/idUtils';
import { formatCents } from '@/utils/moneyUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';

import { formatRange } from '@apps/runway/utils/rangeText';
import { describeBillTiming } from '@apps/runway/utils/billText';
import { getExtras } from '@apps/runway/engine/parts';
import { applyMove, type PriorityMove } from '@apps/runway/engine/priorities';
import { describeFunding } from '@apps/runway/utils/fundingText';
import { sealJson } from '@apps/runway/security';
import { DAY_MS } from '@apps/runway/engine/dates';
import type { VersionStretch } from '@apps/runway/engine/resolve';
import {
  getHeldReleaseDay,
  readHeldReleasedOn,
  type HeldChoice,
} from '@apps/runway/engine/endings';
import type { ItemPayload } from '@apps/runway/utils/changeText';
import type {
  BillSealed,
  ChangeDoc,
  ChangeSealed,
  DateOnly,
  EnvelopeSealed,
  GoalSealed,
  GroupSealed,
  HorizonSealed,
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
  `Added ${payLineName} from ${sourceName}, ${formatRange(amount)}, from ${formatDateOrdinalUTC(startDate)}.`;

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
    heldReleasedOn: null,
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
  /** A group the person named while adding the envelope; it is written in the same batch and the envelope joins it. */
  newGroup?: GroupSealed | null;
}

/**
 * Adds an envelope as a header, a first version and one change entry in a single batch, with the
 * new group's three documents beside them when the envelope names one. Items and versions are
 * created and never updated; nothing is written to `days`.
 */
export async function createEnvelope(
  uid: string,
  encryption: RunwayEncryption,
  { envelope: draftEnvelope, startDate, newGroup = null }: CreateEnvelopeInput,
): Promise<{ envelopeId: string; groupId: string | null }> {
  const now = Date.now();
  const envelopeId = generateUuid();
  const changeId = generateUuid();
  const groupDocs = newGroup
    ? await buildGroupDocs(encryption, { group: newGroup, startDate }, now)
    : null;
  const envelope: EnvelopeSealed = groupDocs
    ? { ...draftEnvelope, groupId: groupDocs.groupId }
    : draftEnvelope;
  const changePayload: ChangeSealed = {
    summary: `Added ${envelope.name}, ${describeFunding(envelope.funding, getExtras(envelope))}.`,
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
    heldReleasedOn: null,
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
  if (groupDocs) {
    batch.set(itemPath(uid, 'items', groupDocs.groupId), groupDocs.header);
    batch.set(
      itemPath(uid, 'versions', groupDocs.version.id),
      groupDocs.version,
    );
    batch.set(itemPath(uid, 'changes', groupDocs.change.id), groupDocs.change);
  }
  batch.set(itemPath(uid, 'items', envelopeId), header);
  batch.set(itemPath(uid, 'versions', version.id), version);
  batch.set(itemPath(uid, 'changes', changeId), change);
  await batch.commit();

  return { envelopeId, groupId: groupDocs?.groupId ?? null };
}

export interface CreateGroupInput {
  group: GroupSealed;
  /** The first day this group is in the plan. */
  startDate: number;
}

/** The three documents that add a group, committed in the batch of the bill that names it. */
export async function buildGroupDocs(
  encryption: RunwayEncryption,
  { group, startDate }: CreateGroupInput,
  now: number,
) {
  const groupId = generateUuid();
  const changeId = generateUuid();
  const [groupSealed, changeSealed] = await Promise.all([
    sealJson(group, encryption),
    sealJson<ChangeSealed>(
      { summary: `Started using ${group.name}.` },
      encryption,
    ),
  ]);
  const header: PlanItemDoc = {
    id: groupId,
    kind: 'group',
    parentId: null,
    createdAt: now,
    endedAt: null,
    archivedAt: null,
    heldReleasedOn: null,
  };
  const version: PlanVersionDoc = {
    id: generateUuid(),
    itemId: groupId,
    kind: 'group',
    createdAt: now,
    effectiveFrom: startDate,
    effectiveUntil: null,
    changeId,
    sealed: groupSealed,
  };
  const change: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: startDate,
    itemIds: [groupId],
    sealed: changeSealed,
  };
  return { groupId, header, version, change };
}

export interface CreateBillInput {
  bill: BillSealed;
  /** The first day this bill is in the plan. */
  startDate: number;
  /** A group the person named while adding the bill; it is written in the same batch and the bill joins it. */
  newGroup?: GroupSealed | null;
}

/**
 * Adds a bill as a header, a first version and one change entry in a single batch, with the new
 * group's three documents beside them when the bill names one. Items and versions are created and
 * never updated; nothing is written to `days`.
 */
export async function createBill(
  uid: string,
  encryption: RunwayEncryption,
  { bill: draftBill, startDate, newGroup = null }: CreateBillInput,
): Promise<{ billId: string; groupId: string | null }> {
  const now = Date.now();
  const billId = generateUuid();
  const changeId = generateUuid();
  const groupDocs = newGroup
    ? await buildGroupDocs(encryption, { group: newGroup, startDate }, now)
    : null;
  const bill: BillSealed = groupDocs
    ? { ...draftBill, groupId: groupDocs.groupId }
    : draftBill;
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
    heldReleasedOn: null,
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
  if (groupDocs) {
    batch.set(itemPath(uid, 'items', groupDocs.groupId), groupDocs.header);
    batch.set(
      itemPath(uid, 'versions', groupDocs.version.id),
      groupDocs.version,
    );
    batch.set(itemPath(uid, 'changes', groupDocs.change.id), groupDocs.change);
  }
  batch.set(itemPath(uid, 'items', billId), header);
  batch.set(itemPath(uid, 'versions', version.id), version);
  batch.set(itemPath(uid, 'changes', changeId), change);
  await batch.commit();

  return { billId, groupId: groupDocs?.groupId ?? null };
}

export interface CreateGoalInput {
  goal: GoalSealed;
  /** The first day this goal is in the plan. */
  startDate: number;
  /** A group the person named while adding the goal; it is written in the same batch and the goal joins it. */
  newGroup?: GroupSealed | null;
}

/**
 * Adds a goal as a header, a first version and one change entry in a single batch, with the new
 * group's three documents beside them when the goal names one. Items and versions are created and
 * never updated; nothing is written to `days`.
 */
export async function createGoal(
  uid: string,
  encryption: RunwayEncryption,
  { goal: draftGoal, startDate, newGroup = null }: CreateGoalInput,
): Promise<{ goalId: string }> {
  const now = Date.now();
  const goalId = generateUuid();
  const changeId = generateUuid();
  const groupDocs = newGroup
    ? await buildGroupDocs(encryption, { group: newGroup, startDate }, now)
    : null;
  const goal: GoalSealed = groupDocs
    ? { ...draftGoal, groupId: groupDocs.groupId }
    : draftGoal;
  const dateText =
    goal.targetDate === null
      ? ''
      : ` by ${formatDateOrdinalUTC(goal.targetDate)}`;
  const changePayload: ChangeSealed = {
    summary: `Added ${goal.name}, ${formatCents(goal.targetCents)}${dateText}, ${describeFunding(goal.funding, getExtras(goal))}.`,
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
    heldReleasedOn: null,
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
  if (groupDocs) {
    batch.set(itemPath(uid, 'items', groupDocs.groupId), groupDocs.header);
    batch.set(
      itemPath(uid, 'versions', groupDocs.version.id),
      groupDocs.version,
    );
    batch.set(itemPath(uid, 'changes', groupDocs.change.id), groupDocs.change);
  }
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
  /** The day the change entry says it covers income days from; null for a change that moves no money. Defaults to `effectiveFrom`. */
  changeEffectiveFrom?: number | null;
  /** The first day the change no longer covers, so the version before it returns; null lasts until superseded. */
  effectiveUntil?: number | null;
  /** A group the person named while changing a bill, envelope or goal; it is written in the same batch and the bill joins it. */
  newGroup?: GroupSealed | null;
  /** For a change to one field only: the item's stretches from `effectiveFrom` on, each written as its own version so later and temporary versions keep their amounts and dates. */
  stretches?: VersionStretch<ItemPayload>[];
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
  const groupDocs =
    input.newGroup &&
    (input.kind === 'bill' ||
      input.kind === 'envelope' ||
      input.kind === 'goal')
      ? await buildGroupDocs(
          encryption,
          { group: input.newGroup, startDate: input.effectiveFrom },
          now,
        )
      : null;
  const withGroup = (payload: ItemPayload): ItemPayload =>
    groupDocs
      ? {
          ...(payload as BillSealed | EnvelopeSealed | GoalSealed),
          groupId: groupDocs.groupId,
        }
      : payload;
  const stretches: VersionStretch<ItemPayload>[] = input.stretches ?? [
    {
      payload: input.payload,
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil ?? null,
    },
  ];
  const [changeSealed, ...versionsSealed] = await Promise.all([
    sealJson(changePayload, encryption),
    ...stretches.map((stretch) =>
      sealJson(withGroup(stretch.payload), encryption),
    ),
  ]);
  const versions = stretches.map((stretch, index): PlanVersionDoc => ({
    id: generateUuid(),
    itemId: input.itemId,
    kind: input.kind,
    createdAt: now,
    effectiveFrom: stretch.effectiveFrom,
    effectiveUntil: stretch.effectiveUntil,
    changeId,
    sealed: versionsSealed[index],
  }));
  const change: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom:
      input.changeEffectiveFrom === undefined
        ? input.effectiveFrom
        : input.changeEffectiveFrom,
    itemIds: [input.itemId],
    sealed: changeSealed,
  };
  const batch = writeBatch(db);
  if (groupDocs) {
    batch.set(itemPath(uid, 'items', groupDocs.groupId), groupDocs.header);
    batch.set(
      itemPath(uid, 'versions', groupDocs.version.id),
      groupDocs.version,
    );
    batch.set(itemPath(uid, 'changes', groupDocs.change.id), groupDocs.change);
  }
  versions.forEach((version) =>
    batch.set(itemPath(uid, 'versions', version.id), version),
  );
  batch.set(itemPath(uid, 'changes', changeId), change);
  await batch.commit();
}

/** A batch holds 500 writes; the change entry takes one and the rest is left for growth. */
/** The most versions one batched plan write may hold, under Firestore's batch limit. */
export const MAX_REORDER_WRITES = 450;

export interface ReorderItemsInput {
  /** The stretches from today on each keep their own payload; only tiers and ranks change. */
  moves: PriorityMove<
    BillSealed | EnvelopeSealed | GoalSealed | HorizonSealed
  >[];
  summary: string;
  effectiveFrom: number;
}

/**
 * Saves a new funding order as one whole-payload version per stretch of each moved item (one for an
 * item with one version in force) and one change entry for the whole save, in a single batch of at most
 * 450 versions. Nothing already written is touched, and no amount or date changes.
 */
export async function reorderItems(
  uid: string,
  encryption: RunwayEncryption,
  input: ReorderItemsInput,
): Promise<void> {
  const now = Date.now();
  const changeId = generateUuid();
  const writes = input.moves.flatMap((move) =>
    move.segments.map((segment) => ({ move, segment })),
  );
  if (writes.length > MAX_REORDER_WRITES)
    throw new Error(
      'That moves too many items to save at once. Move fewer and save again.',
    );
  const [changeSealed, ...versionsSealed] = await Promise.all([
    sealJson<ChangeSealed>({ summary: input.summary, note: null }, encryption),
    ...writes.map(({ move, segment }) =>
      sealJson(applyMove(segment.payload, move), encryption),
    ),
  ]);
  const change: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: input.effectiveFrom,
    itemIds: input.moves.map((move) => move.itemId),
    sealed: changeSealed,
  };
  const batch = writeBatch(db);
  writes.forEach(({ move, segment }, index) => {
    const version: PlanVersionDoc = {
      id: generateUuid(),
      itemId: move.itemId,
      kind: move.kind,
      createdAt: now,
      effectiveFrom: segment.effectiveFrom,
      effectiveUntil: segment.effectiveUntil,
      changeId,
      sealed: versionsSealed[index],
    };
    batch.set(itemPath(uid, 'versions', version.id), version);
  });
  batch.set(itemPath(uid, 'changes', changeId), change);
  await batch.commit();
}

export interface SetGroupPriorityInput {
  groupId: string;
  /** The group's new payload, or null when its pick stays as it is. */
  group: GroupSealed | null;
  /** Each member's stretches from today on, as they will read. */
  members: {
    itemId: string;
    kind: 'bill' | 'envelope' | 'goal';
    stretches: VersionStretch<ItemPayload>[];
  }[];
  summary: string;
  effectiveFrom: number;
}

/**
 * Saves a group's priority and what it does to its members as one batch: the group's new version, one
 * version per stretch of each member and one change entry naming them all, so the group and its items
 * never disagree half way. Nothing already written is touched.
 */
export async function setGroupPriority(
  uid: string,
  encryption: RunwayEncryption,
  input: SetGroupPriorityInput,
): Promise<void> {
  const now = Date.now();
  const changeId = generateUuid();
  const writes: {
    itemId: string;
    kind: PlanVersionDoc['kind'];
    stretch: VersionStretch<ItemPayload>;
  }[] = [
    ...(input.group === null
      ? []
      : [
          {
            itemId: input.groupId,
            kind: 'group' as const,
            stretch: {
              payload: input.group,
              effectiveFrom: input.effectiveFrom,
              effectiveUntil: null,
            },
          },
        ]),
    ...input.members.flatMap((member) =>
      member.stretches.map((stretch) => ({
        itemId: member.itemId,
        kind: member.kind,
        stretch,
      })),
    ),
  ];
  if (writes.length > MAX_REORDER_WRITES)
    throw new Error(GROUP_WORDS.priorityTooMany);
  const [changeSealed, ...versionsSealed] = await Promise.all([
    sealJson<ChangeSealed>({ summary: input.summary, note: null }, encryption),
    ...writes.map(({ stretch }) => sealJson(stretch.payload, encryption)),
  ]);
  const change: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: input.effectiveFrom,
    itemIds: Array.from(
      new Set([input.groupId, ...writes.map(({ itemId }) => itemId)]),
    ),
    sealed: changeSealed,
  };
  const batch = writeBatch(db);
  writes.forEach(({ itemId, kind, stretch }, index) => {
    const version: PlanVersionDoc = {
      id: generateUuid(),
      itemId,
      kind,
      createdAt: now,
      effectiveFrom: stretch.effectiveFrom,
      effectiveUntil: stretch.effectiveUntil,
      changeId,
      sealed: versionsSealed[index],
    };
    batch.set(itemPath(uid, 'versions', version.id), version);
  });
  batch.set(itemPath(uid, 'changes', changeId), change);
  await batch.commit();
}

export interface EndItemInput {
  itemId: string;
  /** The last day the item counts; it is gone from the day after. */
  endedOn: number;
  summary: string;
  note: string | null;
  /** What the person chose for the money it holds; null when it holds none and none was asked. */
  heldChoice: HeldChoice | null;
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
    transaction.update(headerRef, {
      endedAt: input.endedOn,
      heldReleasedOn:
        input.heldChoice === null
          ? null
          : getHeldReleaseDay(input.heldChoice, input.endedOn + DAY_MS),
    });
    transaction.set(itemPath(uid, 'changes', changeId), entry);
    return true;
  });
  return written;
}

export interface ArchiveItemInput {
  itemId: string;
  summary: string;
  note: string | null;
  /** What the person chose for the money it holds; null when it holds none and none was asked. */
  heldChoice: HeldChoice | null;
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
    const releasedOn = readHeldReleasedOn(header);
    transaction.update(headerRef, {
      archivedAt,
      heldReleasedOn:
        input.heldChoice === null
          ? releasedOn
          : getHeldReleaseDay(input.heldChoice, archivedAt),
    });
    transaction.set(itemPath(uid, 'changes', changeId), entry);
    return true;
  });
  return written;
}

/**
 * Releases what a stopped item kept: from `releasedOn` it is Free to Spend. Only a header that is
 * stopped and still keeps its money is changed, so a second tap or another device writes nothing;
 * returns whether this call wrote it.
 */
export async function releaseHeld(
  uid: string,
  itemId: string,
  releasedOn: DateOnly,
): Promise<boolean> {
  const headerRef = itemPath(uid, 'items', itemId);
  const written = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(headerRef);
    if (!snapshot.exists()) throw new Error('This item no longer exists.');
    const header = snapshot.data() as Partial<PlanItemDoc>;
    const isStopped =
      (header.archivedAt ?? null) !== null || (header.endedAt ?? null) !== null;
    if (!isStopped || readHeldReleasedOn(header) !== null) return false;
    transaction.update(headerRef, { heldReleasedOn: releasedOn });
    return true;
  });
  return written;
}

/** Undoes `releaseHeld`: the item keeps its money again, only while the release is still the one this device wrote. */
export async function undoReleaseHeld(
  uid: string,
  itemId: string,
  releasedOn: DateOnly,
): Promise<boolean> {
  const headerRef = itemPath(uid, 'items', itemId);
  const written = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(headerRef);
    if (!snapshot.exists()) return false;
    const header = snapshot.data() as Partial<PlanItemDoc>;
    if ((header.heldReleasedOn ?? null) !== releasedOn) return false;
    transaction.update(headerRef, { heldReleasedOn: null });
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
    summary: `${input.goal.name}: ${isPaused ? 'saving paused' : 'saving started again'}, from ${formatDateOrdinalUTC(input.effectiveFrom)}.`,
    note: input.note,
    effectiveFrom: input.effectiveFrom,
  });
}
