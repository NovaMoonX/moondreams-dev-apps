import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { MAX_PURCHASE_LINES } from '@apps/runway/constants';
import {
  getCountedFrom,
  isInTrackingPeriods,
  sumLines,
} from '@apps/runway/engine/purchases';
import { sealJson } from '@apps/runway/security';
import type {
  Cents,
  DateOnly,
  PlanDoc,
  PlanItemDoc,
  PurchaseDoc,
  PurchaseLine,
  PurchaseSealed,
  RunwayEncryption,
} from '@apps/runway/types';

const purchaseRef = (uid: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'purchases', id);

export interface AddPurchaseInput {
  date: DateOnly;
  /** Negative for a refund. */
  amountCents: Cents;
  merchant: string | null;
  note: string | null;
  lines: PurchaseLine[];
  refundOfId: string | null;
}

/** Adds a purchase by hand; the plan and each envelope are read fresh in the same transaction, so a day outside tracking or an archived envelope is refused. */
export async function addPurchase(
  uid: string,
  encryption: RunwayEncryption,
  input: AddPurchaseInput,
): Promise<string> {
  if (input.amountCents === 0) throw new Error('Enter an amount.');
  if (input.lines.length === 0 || input.lines.length > MAX_PURCHASE_LINES) {
    throw new Error('Pick where it comes from.');
  }
  if (sumLines(input.lines) !== input.amountCents) {
    throw new Error('The parts do not add up to the amount.');
  }

  const id = generateUuid();
  const sealed = await sealJson(
    {
      amountCents: input.amountCents,
      merchant: input.merchant,
      note: input.note,
      lines: input.lines,
      refundOfId: input.refundOfId,
    } satisfies PurchaseSealed,
    encryption,
  );
  const envelopeIds = [
    ...new Set(
      input.lines.flatMap((line) =>
        line.envelopeId === null ? [] : [line.envelopeId],
      ),
    ),
  ];

  await runTransaction(db, async (transaction) => {
    const planRef = doc(db, 'apps', 'runway', 'plans', uid);
    const [plan, ...envelopes] = await Promise.all([
      transaction.get(planRef),
      ...envelopeIds.map((envelopeId) =>
        transaction.get(
          doc(db, 'apps', 'runway', 'plans', uid, 'items', envelopeId),
        ),
      ),
    ]);
    const periods = (plan.data() as PlanDoc | undefined)?.trackingPeriods ?? [];
    if (!isInTrackingPeriods(periods, input.date)) {
      throw new Error(
        `Tracking was not on for ${formatDateUTC(input.date)}. Pick a day you were tracking.`,
      );
    }
    const countedFrom = getCountedFrom(periods);
    if (countedFrom === null || input.date < countedFrom) {
      throw new Error(
        countedFrom === null
          ? 'Tracking is off, probably from another device. Reopen Runway to see where it stands.'
          : `Tracking started again on ${formatDateUTC(countedFrom)}, and an earlier day is not counted. Pick that day or a later one.`,
      );
    }
    const isGone = envelopes.some((snapshot) => {
      const item = snapshot.data() as PlanItemDoc | undefined;
      return !item || item.kind !== 'envelope' || item.archivedAt !== null;
    });
    if (isGone) {
      throw new Error(
        'An envelope you picked was archived or removed on another device. Pick again.',
      );
    }

    const now = Date.now();
    transaction.set(purchaseRef(uid, id), {
      id,
      date: input.date,
      source: 'manual',
      needsHome: false,
      createdAt: now,
      updatedAt: now,
      sealed,
    } satisfies PurchaseDoc);
  });
  return id;
}
