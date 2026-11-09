import { doc, runTransaction, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import {
  GROUP_WORDS,
  HORIZON_END_WORDS,
  PART_OF_WORDS,
} from '@apps/runway/constants';
import { generateUuid } from '@/utils/idUtils';
import { formatCents } from '@/utils/moneyUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';

import { formatRange } from '@apps/runway/utils/rangeText';
import { describeBillTiming } from '@apps/runway/utils/billText';
import { getExtras } from '@apps/runway/engine/parts';
import { getNextVersionId } from '@apps/runway/engine/horizon';
import {
  addLink,
  getEndChangeId,
  removeLink,
} from '@apps/runway/engine/horizonLinks';
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
  FundingRule,
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

type PlanWrite =
  | { collection: 'items'; id: string; data: PlanItemDoc }
  | { collection: 'versions'; id: string; data: PlanVersionDoc }
  | { collection: 'changes'; id: string; data: ChangeDoc };

const planWrite = (
  collection: 'items' | 'versions' | 'changes',
  data: PlanItemDoc | PlanVersionDoc | ChangeDoc,
) => ({ collection, id: data.id, data }) as PlanWrite;

/** Commits new documents in one batch, or, when the write also edits an event, in a transaction that refuses once the event's next version exists (it changed on another device). */
async function commitPlanWrites(
  uid: string,
  writes: PlanWrite[],
  linked: Awaited<ReturnType<typeof sealEventVersion>> | null,
): Promise<void> {
  if (linked === null) {
    const batch = writeBatch(db);
    writes.forEach(({ collection, id, data }) =>
      batch.set(itemPath(uid, collection, id), data),
    );
    await batch.commit();
    return;
  }
  await runTransaction(db, async (transaction) => {
    const eventTaken = await transaction.get(
      itemPath(uid, 'versions', linked.version.id),
    );
    if (eventTaken.exists()) throw new Error(PART_OF_WORDS.eventChanged);
    writes.forEach(({ collection, id, data }) =>
      transaction.set(itemPath(uid, collection, id), data),
    );
    transaction.set(
      itemPath(uid, 'versions', linked.version.id),
      linked.version,
    );
    transaction.set(itemPath(uid, 'changes', linked.log.id), linked.log);
  });
}

/** A new envelope or goal that starts later: the lists show it from today asking for nothing, and its real payload starts on `startsOn` as a planned change of its own (written a moment later, so it wins on its day). */
const IDLE_FUNDING: FundingRule = {
  amount: { kind: 'exact', cents: 0 },
  cadence: { kind: 'none' },
};

async function sealLaterStart(
  encryption: RunwayEncryption,
  later: {
    itemId: string;
    kind: 'envelope' | 'goal';
    payload: EnvelopeSealed | GoalSealed;
    startsOn: DateOnly;
    now: number;
  },
) {
  const startChangeId = generateUuid();
  const [idleSealed, startSealed, entrySealed] = await Promise.all([
    sealJson(
      { ...later.payload, funding: IDLE_FUNDING, extras: null },
      encryption,
    ),
    sealJson(later.payload, encryption),
    sealJson<ChangeSealed>(
      {
        summary: `${later.payload.name}: starts from ${formatDateOrdinalUTC(later.startsOn)}.`,
      },
      encryption,
    ),
  ]);
  return {
    startChangeId,
    idleSealed,
    version: {
      id: generateUuid(),
      itemId: later.itemId,
      kind: later.kind,
      createdAt: later.now + 1,
      effectiveFrom: later.startsOn,
      effectiveUntil: null,
      changeId: startChangeId,
      sealed: startSealed,
    } satisfies PlanVersionDoc,
    change: {
      id: startChangeId,
      kind: 'planChange',
      createdAt: later.now + 1,
      effectiveFrom: later.startsOn,
      itemIds: [later.itemId],
      sealed: entrySealed,
    } satisfies ChangeDoc,
  };
}

export interface CreateIncomeInput {
  /** An existing source to add the pay line to; null names a new one. */
  sourceId: string | null;
  sourceName: string;
  payLineName: string;
  amount: MoneyRange;
  stanceOverride: Stance | null;
  /** The account the pay lands in; null when not chosen. */
  accountId: string | null;
  schedule: Schedule;
  ending: Ending;
  /** The first day this income is in the plan: its first payday, so a pay that starts later is part of an event from that day. */
  startDate: number;
  /** Makes the new pay part of an open event in the same write. */
  link?: EventLink | null;
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
    accountId: input.accountId,
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

  const payLineVersion = firstVersion(payLineId, 'payLine', payLineSealed);
  const sourceVersion = sourceSealed
    ? firstVersion(sourceId, 'source', sourceSealed)
    : null;
  await commitPlanWrites(
    uid,
    [
      ...(sourceVersion
        ? [
            planWrite('items', header(sourceId, 'source', null)),
            planWrite('versions', sourceVersion),
          ]
        : []),
      planWrite('items', header(payLineId, 'payLine', sourceId)),
      planWrite('versions', payLineVersion),
      planWrite('changes', change),
    ],
    input.link
      ? await sealEventLink(encryption, input.link, {
          changeId,
          itemId: payLineId,
          now,
        })
      : null,
  );

  return { sourceId, payLineId };
}

export interface CreateEnvelopeInput {
  envelope: EnvelopeSealed;
  /** The first day this envelope is in the plan. */
  startDate: number;
  /** A group the person named while adding the envelope; it is written in the same batch and the envelope joins it. */
  newGroup?: GroupSealed | null;
  /** A day after `startDate` the envelope starts taking money. It is listed from today asking for nothing and a planned change from this day gives it its real payload, so a link to the start points at that change; null or today starts it now. */
  startsOn?: DateOnly | null;
  /** Makes the new envelope (or its later start) part of an open event in the same write. */
  link?: EventLink | null;
}

/**
 * Adds an envelope as a header, a first version and one change entry in a single batch, with the
 * new group's three documents beside them when the envelope names one. Items and versions are
 * created and never updated; nothing is written to `days`.
 */
export async function createEnvelope(
  uid: string,
  encryption: RunwayEncryption,
  {
    envelope: draftEnvelope,
    startDate,
    newGroup = null,
    startsOn = null,
    link = null,
  }: CreateEnvelopeInput,
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
  const laterOn = startsOn !== null && startsOn > startDate ? startsOn : null;
  const changePayload: ChangeSealed = {
    summary: `Added ${envelope.name}, ${describeFunding(envelope.funding, getExtras(envelope))}${laterOn === null ? '' : `, from ${formatDateOrdinalUTC(laterOn)}`}.`,
  };

  const [envelopeSealed, changeSealed, later] = await Promise.all([
    sealJson(envelope, encryption),
    sealJson(changePayload, encryption),
    laterOn === null
      ? Promise.resolve(null)
      : sealLaterStart(encryption, {
          itemId: envelopeId,
          kind: 'envelope',
          payload: envelope,
          startsOn: laterOn,
          now,
        }),
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
    sealed: later?.idleSealed ?? envelopeSealed,
  };
  const change: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: later === null ? startDate : null,
    itemIds: [envelopeId],
    sealed: changeSealed,
  };

  await commitPlanWrites(
    uid,
    [
      ...(groupDocs
        ? [
            planWrite('items', groupDocs.header),
            planWrite('versions', groupDocs.version),
            planWrite('changes', groupDocs.change),
          ]
        : []),
      planWrite('items', header),
      planWrite('versions', version),
      planWrite('changes', change),
      ...(later
        ? [
            planWrite('versions', later.version),
            planWrite('changes', later.change),
          ]
        : []),
    ],
    link
      ? await sealEventLink(encryption, link, {
          changeId: later?.startChangeId ?? changeId,
          itemId: envelopeId,
          now,
        })
      : null,
  );

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
  /** Makes the new bill part of an open event in the same write; its start is its first due day, which a link to it reads from the schedule. */
  link?: EventLink | null;
}

/**
 * Adds a bill as a header, a first version and one change entry in a single batch, with the new
 * group's three documents beside them when the bill names one. Items and versions are created and
 * never updated; nothing is written to `days`.
 */
export async function createBill(
  uid: string,
  encryption: RunwayEncryption,
  { bill: draftBill, startDate, newGroup = null, link = null }: CreateBillInput,
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

  await commitPlanWrites(
    uid,
    [
      ...(groupDocs
        ? [
            planWrite('items', groupDocs.header),
            planWrite('versions', groupDocs.version),
            planWrite('changes', groupDocs.change),
          ]
        : []),
      planWrite('items', header),
      planWrite('versions', version),
      planWrite('changes', change),
    ],
    link
      ? await sealEventLink(encryption, link, {
          changeId,
          itemId: billId,
          now,
        })
      : null,
  );

  return { billId, groupId: groupDocs?.groupId ?? null };
}

export interface CreateGoalInput {
  goal: GoalSealed;
  /** The first day this goal is in the plan. */
  startDate: number;
  /** A group the person named while adding the goal; it is written in the same batch and the goal joins it. */
  newGroup?: GroupSealed | null;
  /** A day after `startDate` the goal starts taking money; written like an envelope's later start (see `CreateEnvelopeInput`). */
  startsOn?: DateOnly | null;
  /** Makes the new goal (or its later start) part of an open event in the same write. */
  link?: EventLink | null;
}

/**
 * Adds a goal as a header, a first version and one change entry in a single batch, with the new
 * group's three documents beside them when the goal names one. Items and versions are created and
 * never updated; nothing is written to `days`.
 */
export async function createGoal(
  uid: string,
  encryption: RunwayEncryption,
  {
    goal: draftGoal,
    startDate,
    newGroup = null,
    startsOn = null,
    link = null,
  }: CreateGoalInput,
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
  const laterOn = startsOn !== null && startsOn > startDate ? startsOn : null;
  const changePayload: ChangeSealed = {
    summary: `Added ${goal.name}, ${formatCents(goal.targetCents)}${dateText}, ${describeFunding(goal.funding, getExtras(goal))}${laterOn === null ? '' : `, from ${formatDateOrdinalUTC(laterOn)}`}.`,
  };

  const [goalSealed, changeSealed, later] = await Promise.all([
    sealJson(goal, encryption),
    sealJson(changePayload, encryption),
    laterOn === null
      ? Promise.resolve(null)
      : sealLaterStart(encryption, {
          itemId: goalId,
          kind: 'goal',
          payload: goal,
          startsOn: laterOn,
          now,
        }),
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
    sealed: later?.idleSealed ?? goalSealed,
  };
  const change: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: later === null ? startDate : null,
    itemIds: [goalId],
    sealed: changeSealed,
  };

  await commitPlanWrites(
    uid,
    [
      ...(groupDocs
        ? [
            planWrite('items', groupDocs.header),
            planWrite('versions', groupDocs.version),
            planWrite('changes', groupDocs.change),
          ]
        : []),
      planWrite('items', header),
      planWrite('versions', version),
      planWrite('changes', change),
      ...(later
        ? [
            planWrite('versions', later.version),
            planWrite('changes', later.change),
          ]
        : []),
    ],
    link
      ? await sealEventLink(encryption, link, {
          changeId: later?.startChangeId ?? changeId,
          itemId: goalId,
          now,
        })
      : null,
  );

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
  /** For an event (`horizon`) only: the id of the version the edit was made from. Each version is written under an id named after it and the write is refused when that id is taken, so two devices editing the same version cannot both land. */
  baseVersionId?: string;
  /** Links this change to an open event in the same write: the event as it stands, the id of the version it was read from, and the line the event's log gets. The write is refused when that version was replaced elsewhere. */
  link?: {
    eventId: string;
    horizon: HorizonSealed;
    baseVersionId: string;
    /** The day the event's new version starts: today, so the link shows at once whatever day the change is dated. */
    on: number;
    summary: string;
  } | null;
}

/** An open event as the device reads it just before a write, and the line its log gets: what makes an item's write also edit the event, refused when the event changed on another device. Build it with `getEventLink`. */
export type EventLink = NonNullable<ChangeItemInput['link']>;

/** The event's next version with the change linked and the line its log gets, ready to write beside the change. */
async function sealEventLink(
  encryption: RunwayEncryption,
  link: EventLink,
  made: { changeId: string; itemId: string; now: number },
) {
  return sealEventVersion(
    encryption,
    link,
    addLink(link.horizon, { changeId: made.changeId, itemId: made.itemId }),
    made.now,
  );
}

/** The event's next version holding `horizon`, and the line its log gets, ready to write in the same transaction as the item's change. */
async function sealEventVersion(
  encryption: RunwayEncryption,
  link: EventLink,
  horizon: HorizonSealed,
  now: number,
) {
  const [eventSealed, logSealed] = await Promise.all([
    sealJson(horizon, encryption),
    sealJson(
      { summary: link.summary, note: null } satisfies ChangeSealed,
      encryption,
    ),
  ]);
  const logId = generateUuid();
  return {
    version: {
      id: getNextVersionId(link.baseVersionId),
      itemId: link.eventId,
      kind: 'horizon',
      createdAt: now,
      effectiveFrom: link.on,
      effectiveUntil: null,
      changeId: logId,
      sealed: eventSealed,
    } satisfies PlanVersionDoc,
    log: {
      id: logId,
      kind: 'planChange',
      createdAt: now,
      effectiveFrom: null,
      itemIds: [link.eventId],
      sealed: logSealed,
    } satisfies ChangeDoc,
  };
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
  const base = input.kind === 'horizon' ? input.baseVersionId : undefined;
  const getVersionId = (index: number) =>
    base === undefined ? generateUuid() : getNextVersionId(base, index);
  const versions = stretches.map((stretch, index): PlanVersionDoc => ({
    id: getVersionId(index),
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
  const linked = input.link
    ? await sealEventLink(encryption, input.link, {
        changeId,
        itemId: input.itemId,
        now,
      })
    : null;
  if (base !== undefined || linked !== null) {
    await runTransaction(db, async (transaction) => {
      const [taken, eventTaken] = await Promise.all([
        base === undefined
          ? Promise.resolve(null)
          : transaction.get(itemPath(uid, 'versions', versions[0].id)),
        linked === null
          ? Promise.resolve(null)
          : transaction.get(itemPath(uid, 'versions', linked.version.id)),
      ]);
      if (taken?.exists()) throw new Error(HORIZON_END_WORDS.changedJustNow);
      if (eventTaken?.exists()) throw new Error(PART_OF_WORDS.eventChanged);
      if (groupDocs) {
        transaction.set(
          itemPath(uid, 'items', groupDocs.groupId),
          groupDocs.header,
        );
        transaction.set(
          itemPath(uid, 'versions', groupDocs.version.id),
          groupDocs.version,
        );
        transaction.set(
          itemPath(uid, 'changes', groupDocs.change.id),
          groupDocs.change,
        );
      }
      versions.forEach((version) =>
        transaction.set(itemPath(uid, 'versions', version.id), version),
      );
      transaction.set(itemPath(uid, 'changes', changeId), change);
      if (linked !== null) {
        transaction.set(
          itemPath(uid, 'versions', linked.version.id),
          linked.version,
        );
        transaction.set(itemPath(uid, 'changes', linked.log.id), linked.log);
      }
    });
    return;
  }
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
  /** For each moved event (`horizon`), the id of the version in force it was read from. Its new versions are named after it and the save is refused when one is taken, so a second device's edit of the same version is not overwritten. */
  baseVersionIds?: Record<string, string>;
}

/**
 * Saves a new funding order as one whole-payload version per stretch of each moved item (one for an
 * item with one version in force) and one change entry for the whole save, at most 450 versions. A save
 * that moves an event is a transaction refused when its version changed elsewhere; any other save stays a
 * batch so it still queues offline. Nothing already written is touched, and no amount or date changes.
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
  const versions = writes.map(({ move, segment }, index): PlanVersionDoc => {
    const base = input.baseVersionIds?.[move.itemId];
    const stretch = move.segments.indexOf(segment);
    return {
      id:
        move.kind === 'horizon' && base !== undefined
          ? getNextVersionId(base, stretch)
          : generateUuid(),
      itemId: move.itemId,
      kind: move.kind,
      createdAt: now,
      effectiveFrom: segment.effectiveFrom,
      effectiveUntil: segment.effectiveUntil,
      changeId,
      sealed: versionsSealed[index],
    };
  });
  const guarded = versions.filter(
    ({ kind, itemId }) =>
      kind === 'horizon' && input.baseVersionIds?.[itemId] !== undefined,
  );
  if (guarded.length === 0) {
    const batch = writeBatch(db);
    versions.forEach((version) =>
      batch.set(itemPath(uid, 'versions', version.id), version),
    );
    batch.set(itemPath(uid, 'changes', changeId), change);
    await batch.commit();
    return;
  }
  await runTransaction(db, async (transaction) => {
    const taken = await Promise.all(
      guarded.map(({ id }) => transaction.get(itemPath(uid, 'versions', id))),
    );
    if (taken.some((snapshot) => snapshot.exists()))
      throw new Error(HORIZON_END_WORDS.changedJustNow);
    versions.forEach((version) =>
      transaction.set(itemPath(uid, 'versions', version.id), version),
    );
    transaction.set(itemPath(uid, 'changes', changeId), change);
  });
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
  /** Makes the ending part of an open event: the event gets a link to `ended_${itemId}` in the same transaction, refused when the event changed on another device. */
  link?: EventLink | null;
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
  const changeId = getEndChangeId(input.itemId);
  const sealed = await sealJson<ChangeSealed>(
    { summary: input.summary, note: input.note },
    encryption,
  );
  const linked = input.link
    ? await sealEventLink(encryption, input.link, {
        changeId,
        itemId: input.itemId,
        now: Date.now(),
      })
    : null;
  const headerRef = itemPath(uid, 'items', input.itemId);
  const written = await runTransaction(db, async (transaction) => {
    const [snapshot, eventTaken] = await Promise.all([
      transaction.get(headerRef),
      linked === null
        ? Promise.resolve(null)
        : transaction.get(itemPath(uid, 'versions', linked.version.id)),
    ]);
    if (!snapshot.exists()) throw new Error('This item no longer exists.');
    const header = snapshot.data() as Partial<PlanItemDoc>;
    if ((header.endedAt ?? null) !== null) return false;
    if (eventTaken?.exists()) throw new Error(PART_OF_WORDS.eventChanged);
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
    if (linked !== null) {
      transaction.set(
        itemPath(uid, 'versions', linked.version.id),
        linked.version,
      );
      transaction.set(itemPath(uid, 'changes', linked.log.id), linked.log);
    }
    return true;
  });
  return written;
}

export interface CancelChangeInput {
  itemId: string;
  /** The change to cancel: a version change's `changeId`, or `ended_${itemId}` for a coming end. */
  changeId: string;
  /** For a version change, the ids of every version of the item written with `changeId` (`getCancelTarget`); the write deletes exactly these. Empty for a coming end. */
  versionIds: string[];
  today: DateOnly;
  /** The event that holds the link (`findLinkHolder`), as the device reads it, with the line its log gets; the link is removed in the same transaction. Null when no event holds it. */
  link: EventLink | null;
}

/**
 * Cancels a change that has not started, in one transaction: a version change deletes every version
 * written with its `changeId` and its change entry; a coming end sets `endedAt` back to null, clears
 * the release day the ending set (unless the item was archived, whose release it may be) and deletes
 * `ended_${itemId}`. The matching link leaves the event in the same transaction, which is refused when
 * the event changed on another device. Refuses a change whose first day has come. Returns false when
 * there is nothing left to cancel (another device already did).
 */
export async function cancelChange(
  uid: string,
  encryption: RunwayEncryption,
  input: CancelChangeInput,
): Promise<boolean> {
  const { itemId, changeId } = input;
  const isStop = changeId === getEndChangeId(itemId);
  const linked = input.link
    ? await sealEventVersion(
        encryption,
        input.link,
        removeLink(input.link.horizon, changeId),
        Date.now(),
      )
    : null;
  const headerRef = itemPath(uid, 'items', itemId);
  return runTransaction(db, async (transaction) => {
    const [header, versionDocs, eventTaken] = await Promise.all([
      isStop ? transaction.get(headerRef) : Promise.resolve(null),
      Promise.all(
        isStop
          ? []
          : input.versionIds.map((id) =>
              transaction.get(itemPath(uid, 'versions', id)),
            ),
      ),
      linked === null
        ? Promise.resolve(null)
        : transaction.get(itemPath(uid, 'versions', linked.version.id)),
    ]);
    if (eventTaken?.exists()) throw new Error(PART_OF_WORDS.eventChanged);
    const writeLink = () => {
      if (linked === null) return;
      transaction.set(
        itemPath(uid, 'versions', linked.version.id),
        linked.version,
      );
      transaction.set(itemPath(uid, 'changes', linked.log.id), linked.log);
    };
    if (isStop) {
      if (!header?.exists()) throw new Error('This item no longer exists.');
      const stored = header.data() as Partial<PlanItemDoc>;
      const endedAt = stored.endedAt ?? null;
      if (endedAt === null) return false;
      if (endedAt + DAY_MS <= input.today)
        throw new Error(PART_OF_WORDS.alreadyStarted);
      transaction.update(headerRef, {
        endedAt: null,
        ...((stored.archivedAt ?? null) === null
          ? { heldReleasedOn: null }
          : {}),
      });
      transaction.delete(itemPath(uid, 'changes', changeId));
      writeLink();
      return true;
    }
    const existing = versionDocs.filter((snapshot) => snapshot.exists());
    if (existing.length === 0) return false;
    existing.forEach((snapshot) => {
      const stored = snapshot.data() as Partial<PlanVersionDoc>;
      if (stored.itemId !== itemId || stored.changeId !== changeId)
        throw new Error(HORIZON_END_WORDS.changedJustNow);
      if ((stored.effectiveFrom ?? 0) <= input.today)
        throw new Error(PART_OF_WORDS.alreadyStarted);
      transaction.delete(snapshot.ref);
    });
    transaction.delete(itemPath(uid, 'changes', changeId));
    writeLink();
    return true;
  });
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
  /** The day the change takes effect: today, or a later day for a goal that stops saving then. */
  effectiveFrom: number;
  /** The goal's stretches from `effectiveFrom` on, each with `state` set, so a later change keeps its amounts; defaults to one version from `effectiveFrom`. */
  stretches?: VersionStretch<ItemPayload>[];
  /** Makes the change part of an open event in the same write. */
  link?: EventLink | null;
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
    stretches: input.stretches,
    link: input.link ?? null,
  });
}
