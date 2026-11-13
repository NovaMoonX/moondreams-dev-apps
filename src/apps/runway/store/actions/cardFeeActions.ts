import { doc, type Transaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { CARD_FEE_GROUP_ID } from '@apps/runway/engine/cardFees';
import { DAY_MS } from '@apps/runway/engine/dates';
import {
  getHeldReleaseDay,
  type HeldChoice,
} from '@apps/runway/engine/endings';
import {
  getEndChangeId,
  getEndEntryId,
} from '@apps/runway/engine/horizonLinks';
import type { VersionStretch } from '@apps/runway/engine/resolve';
import { sealJson } from '@apps/runway/security';
import type {
  BillSealed,
  ChangeDoc,
  ChangeSealed,
  DateOnly,
  GroupSealed,
  PlanItemDoc,
  PlanVersionDoc,
  RunwayEncryption,
  Sealed,
} from '@apps/runway/types';

/** What a card save does to its annual fee bill, worked out on the device from the plan it holds. */
export type FeePlan =
  | {
      kind: 'create';
      billId: string;
      bill: BillSealed;
      startDate: DateOnly;
      /** The group as it starts when no device has made it yet. */
      group: GroupSealed;
      groupSummary: string;
      summary: string;
    }
  | {
      kind: 'change';
      billId: string;
      stretches: VersionStretch<BillSealed>[];
      /** The day the entry says it covers income days from; null when only the name changed. */
      effectiveFrom: DateOnly | null;
      summary: string;
    }
  | {
      kind: 'end';
      billId: string;
      endedOn: DateOnly;
      heldChoice: HeldChoice | null;
      summary: string;
    };

export type SealedFeePlan =
  | (Extract<FeePlan, { kind: 'create' }> & {
      billSealed: Sealed;
      groupSealed: Sealed;
      groupChangeSealed: Sealed;
      changeSealed: Sealed;
    })
  | (Extract<FeePlan, { kind: 'change' }> & {
      versionsSealed: Sealed[];
      changeSealed: Sealed;
    })
  | (Extract<FeePlan, { kind: 'end' }> & { changeSealed: Sealed });

const itemPath = (uid: string, collectionName: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, collectionName, id);

/** Seals a fee plan's payloads before the transaction, which must not wait on encryption. */
export async function sealFeePlan(
  encryption: RunwayEncryption,
  plan: FeePlan,
): Promise<SealedFeePlan> {
  const changeSealed = await sealJson<ChangeSealed>(
    { summary: plan.summary, note: null },
    encryption,
  );
  if (plan.kind === 'create') {
    const [billSealed, groupSealed, groupChangeSealed] = await Promise.all([
      sealJson(plan.bill, encryption),
      sealJson(plan.group, encryption),
      sealJson<ChangeSealed>(
        { summary: plan.groupSummary, note: null },
        encryption,
      ),
    ]);
    return {
      ...plan,
      billSealed,
      groupSealed,
      groupChangeSealed,
      changeSealed,
    };
  }
  if (plan.kind === 'change') {
    const versionsSealed = await Promise.all(
      plan.stretches.map((stretch) => sealJson(stretch.payload, encryption)),
    );
    return { ...plan, versionsSealed, changeSealed };
  }
  return { ...plan, changeSealed };
}

export interface FeeReads {
  hasGroup: boolean;
  billHeader: Partial<PlanItemDoc> | null;
  isEndEntryTaken: boolean;
}

/** The reads a fee plan needs, made before any write of the card's transaction. */
export async function readFeePlan(
  transaction: Transaction,
  uid: string,
  plan: SealedFeePlan,
): Promise<FeeReads> {
  if (plan.kind === 'create') {
    const group = await transaction.get(
      itemPath(uid, 'items', CARD_FEE_GROUP_ID),
    );
    return {
      hasGroup: group.exists(),
      billHeader: null,
      isEndEntryTaken: false,
    };
  }
  const [bill, entry] = await Promise.all([
    transaction.get(itemPath(uid, 'items', plan.billId)),
    plan.kind === 'end'
      ? transaction.get(itemPath(uid, 'changes', getEndChangeId(plan.billId)))
      : Promise.resolve(null),
  ]);
  return {
    hasGroup: true,
    billHeader: bill.exists() ? (bill.data() as Partial<PlanItemDoc>) : null,
    isEndEntryTaken: entry?.exists() ?? false,
  };
}

/** Writes a fee plan inside the card's transaction, so the card and its bill never disagree. */
export function applyFeePlan(
  transaction: Transaction,
  uid: string,
  plan: SealedFeePlan,
  reads: FeeReads,
): void {
  const now = Date.now();
  if (plan.kind === 'create') {
    if (!reads.hasGroup) {
      const groupChangeId = generateUuid();
      transaction.set(itemPath(uid, 'items', CARD_FEE_GROUP_ID), {
        id: CARD_FEE_GROUP_ID,
        kind: 'group',
        parentId: null,
        createdAt: now,
        endedAt: null,
        archivedAt: null,
        heldReleasedOn: null,
        becameItemId: null,
      } satisfies PlanItemDoc);
      const groupVersion: PlanVersionDoc = {
        id: generateUuid(),
        itemId: CARD_FEE_GROUP_ID,
        kind: 'group',
        createdAt: now,
        effectiveFrom: plan.startDate,
        effectiveUntil: null,
        changeId: groupChangeId,
        sealed: plan.groupSealed,
      };
      transaction.set(itemPath(uid, 'versions', groupVersion.id), groupVersion);
      transaction.set(itemPath(uid, 'changes', groupChangeId), {
        id: groupChangeId,
        kind: 'planChange',
        createdAt: now,
        effectiveFrom: null,
        itemIds: [CARD_FEE_GROUP_ID],
        sealed: plan.groupChangeSealed,
      } satisfies ChangeDoc);
    }
    const changeId = generateUuid();
    transaction.set(itemPath(uid, 'items', plan.billId), {
      id: plan.billId,
      kind: 'bill',
      parentId: null,
      createdAt: now,
      endedAt: null,
      archivedAt: null,
      heldReleasedOn: null,
      becameItemId: null,
    } satisfies PlanItemDoc);
    const version: PlanVersionDoc = {
      id: generateUuid(),
      itemId: plan.billId,
      kind: 'bill',
      createdAt: now,
      effectiveFrom: plan.startDate,
      effectiveUntil: null,
      changeId,
      sealed: plan.billSealed,
    };
    transaction.set(itemPath(uid, 'versions', version.id), version);
    transaction.set(itemPath(uid, 'changes', changeId), {
      id: changeId,
      kind: 'planChange',
      createdAt: now,
      effectiveFrom: plan.startDate,
      itemIds: [plan.billId],
      sealed: plan.changeSealed,
    } satisfies ChangeDoc);
    return;
  }
  const header = reads.billHeader;
  if (header === null) return;
  const isStopped =
    (header.endedAt ?? null) !== null || (header.archivedAt ?? null) !== null;
  if (isStopped) return;
  if (plan.kind === 'change') {
    const changeId = generateUuid();
    plan.stretches.forEach((stretch, index) => {
      const version: PlanVersionDoc = {
        id: generateUuid(),
        itemId: plan.billId,
        kind: 'bill',
        createdAt: now,
        effectiveFrom: stretch.effectiveFrom,
        effectiveUntil: stretch.effectiveUntil,
        changeId,
        sealed: plan.versionsSealed[index],
      };
      transaction.set(itemPath(uid, 'versions', version.id), version);
    });
    transaction.set(itemPath(uid, 'changes', changeId), {
      id: changeId,
      kind: 'planChange',
      createdAt: now,
      effectiveFrom: plan.effectiveFrom,
      itemIds: [plan.billId],
      sealed: plan.changeSealed,
    } satisfies ChangeDoc);
    return;
  }
  const entryId = getEndEntryId(plan.billId, reads.isEndEntryTaken, now);
  transaction.update(itemPath(uid, 'items', plan.billId), {
    endedAt: plan.endedOn,
    heldReleasedOn:
      plan.heldChoice === null
        ? null
        : getHeldReleaseDay(plan.heldChoice, plan.endedOn + DAY_MS),
  });
  transaction.set(itemPath(uid, 'changes', entryId), {
    id: entryId,
    kind: 'ended',
    createdAt: now,
    effectiveFrom: plan.endedOn,
    itemIds: [plan.billId],
    sealed: plan.changeSealed,
  } satisfies ChangeDoc);
}
