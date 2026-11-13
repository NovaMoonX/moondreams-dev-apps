import {
  doc,
  getDoc,
  runTransaction,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { formatCentsShort } from '@/utils/moneyUtils';
import {
  FINISHED_SALE_STATUS,
  MAX_STATUS_HISTORY,
} from '@apps/going-once/constants';
import { toBundle } from '@apps/going-once/store/listeners/toBundle';
import { toItem } from '@apps/going-once/store/listeners/toItem';
import type {
  Bundle,
  Item,
  ItemPendingRecord,
  ItemSaleRecord,
  ItemStatus,
  PaymentMethod,
  StatusChange,
  StatusChangeKind,
} from '@apps/going-once/types';
import {
  adjustBundlePrice,
  appendBundleChange,
  isSoloLocked,
} from '@apps/going-once/utils/bundles';
import { withoutBuyerName } from '@apps/going-once/utils/finish';
import { toFirstName } from '@apps/going-once/utils/personName';

export type StatusTransition =
  | {
      kind: 'MARK_PENDING';
      inquiryId: string | null;
      buyerName: string | null;
      pickupOn: number | null;
    }
  /** `from` is the hold the editor opened with, so an edit made meanwhile by someone else is never overwritten. */
  | {
      kind: 'CHANGE_HOLD';
      buyerName: string | null;
      pickupOn: number | null;
      from: { buyerName: string | null; pickupOn: number | null };
    }
  | { kind: 'BACK_TO_AVAILABLE' }
  | {
      kind: 'MARK_SOLD';
      priceCents: number;
      method: PaymentMethod | null;
      soldOn: number;
    }
  | { kind: 'NOT_SOLD' }
  /** Undoes the Not sold after all written at `undoesAt`, and only that one. */
  | { kind: 'RESTORE_SALE'; sale: ItemSaleRecord; undoesAt: number }
  /** `undoesAt` ties an Undo to the Put back it undoes. */
  | { kind: 'TAKE_OFF'; undoesAt: number | null }
  /** `undoesAt` ties an Undo to the Take off it undoes. */
  | {
      kind: 'PUT_BACK';
      restorePending: ItemPendingRecord | null;
      undoesAt: number | null;
    }
  | { kind: 'CHANGE_PAID'; priceCents: number };

/** `at` is when the change was written, the stamp an Undo is tied to. */
export type StatusResult =
  { ok: true; at: number } | { ok: false; message: string };

/** The statuses a thing may be in for each change; the transaction re-checks them against its own read. */
const EXPECTED: Record<StatusTransition['kind'], ItemStatus[]> = {
  MARK_PENDING: ['AVAILABLE'],
  CHANGE_HOLD: ['PENDING'],
  BACK_TO_AVAILABLE: ['PENDING'],
  MARK_SOLD: ['AVAILABLE', 'PENDING'],
  NOT_SOLD: ['SOLD'],
  RESTORE_SALE: ['AVAILABLE'],
  TAKE_OFF: ['AVAILABLE', 'PENDING'],
  PUT_BACK: ['WITHDRAWN'],
  CHANGE_PAID: ['SOLD'],
};

export const OFFLINE_MESSAGE = 'Changing the status needs a connection.';
export const GENERIC_MESSAGE = "The status didn't change. Try again.";
export const FINISHED_MESSAGE =
  'This sale is finished. Reopen it to hold things for buyers.';
const HOLDS = ['MARK_PENDING', 'CHANGE_HOLD'];
const GONE_MESSAGE = 'This thing is no longer here.';
const INVALID_MESSAGE = "That amount or day doesn't look right.";
const NO_SALE_MESSAGE = 'There is no sale to change.';
const SAME_PAID_MESSAGE = 'That is already what was paid.';
const SAME_HOLD_MESSAGE = 'That is already the hold.';

export type Stored = Pick<
  Item,
  'status' | 'pending' | 'sale' | 'lastEditedBy' | 'statusHistory'
>;

export interface Next {
  kind: StatusChangeKind;
  status: ItemStatus;
  pending: ItemPendingRecord | null;
  sale: ItemSaleRecord | null;
  fromPriceCents: number | null;
}

export const isMoney = (cents: number) => Number.isInteger(cents) && cents >= 0;
const isDay = (day: number | null) => day === null || Number.isFinite(day);

const isValid = (transition: StatusTransition): boolean => {
  if (transition.kind === 'MARK_SOLD')
    return isMoney(transition.priceCents) && Number.isFinite(transition.soldOn);
  if (transition.kind === 'CHANGE_PAID') return isMoney(transition.priceCents);
  if (transition.kind === 'MARK_PENDING' || transition.kind === 'CHANGE_HOLD')
    return isDay(transition.pickupOn);
  return true;
};

const isHoldUnchanged = (current: Stored, transition: StatusTransition) =>
  transition.kind !== 'CHANGE_HOLD' ||
  (current.pending?.buyerName === transition.from.buyerName &&
    current.pending?.pickupOn === transition.from.pickupOn);

const getHold = (
  current: Stored,
  transition: { buyerName: string | null; pickupOn: number | null },
  uid: string,
  now: number,
): ItemPendingRecord => ({
  inquiryId:
    current.pending?.buyerName === transition.buyerName
      ? (current.pending?.inquiryId ?? null)
      : null,
  buyerName: transition.buyerName,
  pickupOn: transition.pickupOn,
  markedBy: current.pending?.markedBy ?? uid,
  markedAt: current.pending?.markedAt ?? now,
});

/** The record after the change, or a sentence when there is nothing to write. */
export const getNext = (
  current: Stored,
  transition: StatusTransition,
  uid: string,
  now: number,
): Next | string => {
  const keep: Next = {
    kind: transition.kind,
    status: current.status,
    pending: current.pending,
    sale: current.sale,
    fromPriceCents: null,
  };
  if (transition.kind === 'MARK_PENDING')
    return {
      ...keep,
      status: 'PENDING',
      pending: {
        inquiryId: transition.inquiryId,
        buyerName: transition.buyerName,
        pickupOn: transition.pickupOn,
        markedBy: uid,
        markedAt: now,
      },
    };
  if (transition.kind === 'CHANGE_HOLD') {
    if (
      current.pending?.buyerName === transition.buyerName &&
      current.pending?.pickupOn === transition.pickupOn
    )
      return SAME_HOLD_MESSAGE;
    return { ...keep, pending: getHold(current, transition, uid, now) };
  }
  if (transition.kind === 'MARK_SOLD')
    return {
      ...keep,
      status: 'SOLD',
      pending: null,
      sale: {
        priceCents: transition.priceCents,
        method: transition.method,
        soldOn: transition.soldOn,
        buyerName: current.pending?.buyerName ?? null,
        markedBy: uid,
        markedAt: now,
      },
    };
  if (transition.kind === 'CHANGE_PAID') {
    if (current.sale === null) return NO_SALE_MESSAGE;
    if (current.sale.priceCents === transition.priceCents)
      return SAME_PAID_MESSAGE;
    return {
      ...keep,
      sale: { ...current.sale, priceCents: transition.priceCents },
      fromPriceCents: current.sale.priceCents,
    };
  }
  if (transition.kind === 'NOT_SOLD')
    return {
      ...keep,
      status: 'AVAILABLE',
      sale: null,
      fromPriceCents: current.sale?.priceCents ?? null,
    };
  if (transition.kind === 'RESTORE_SALE')
    return { ...keep, status: 'SOLD', pending: null, sale: transition.sale };
  if (transition.kind === 'TAKE_OFF')
    return { ...keep, status: 'WITHDRAWN', pending: null };
  if (transition.kind === 'PUT_BACK')
    return {
      ...keep,
      status: transition.restorePending === null ? 'AVAILABLE' : 'PENDING',
      pending: transition.restorePending,
    };
  return { ...keep, status: 'AVAILABLE', pending: null };
};

/** Whether an Undo still undoes the last thing that happened to the thing. */
const isUndoCurrent = (current: Stored, transition: StatusTransition) => {
  if (
    transition.kind !== 'RESTORE_SALE' &&
    transition.kind !== 'TAKE_OFF' &&
    transition.kind !== 'PUT_BACK'
  )
    return true;
  return (
    transition.undoesAt === null ||
    current.statusHistory.at(-1)?.at === transition.undoesAt
  );
};

const describeLiveStatus = (current: Stored, subject: string): string => {
  if (current.status === 'SOLD')
    return `marked ${subject} sold for ${formatCentsShort(current.sale?.priceCents ?? 0)}`;
  if (current.status === 'PENDING') return `marked ${subject} pending`;
  if (current.status === 'WITHDRAWN') return `took ${subject} off the list`;
  return `put ${subject} back to available`;
};

const getLastActor = (current: Stored): string | null =>
  current.statusHistory.at(-1)?.byUid ??
  current.pending?.markedBy ??
  current.sale?.markedBy ??
  current.lastEditedBy;

const readFirstName = (uid: string): Promise<string> =>
  getDoc(doc(db, 'users', uid)).then(
    (snapshot) => toFirstName(snapshot.data()?.displayName as string),
    () => 'Someone',
  );

export const readActorName = (
  actor: string | null,
  uid: string,
): Promise<string> => {
  if (actor === null) return Promise.resolve('Someone');
  if (actor === uid) return Promise.resolve('You');
  return readFirstName(actor);
};

/** "Theo already marked this sold for $40."; `subject` names the thing when the sentence is about one of several. */
export const describeConflict = async (
  current: Stored,
  uid: string,
  subject = 'this',
): Promise<string> => {
  const who = await readActorName(getLastActor(current), uid);
  return `${who} already ${describeLiveStatus(current, subject)}.`;
};

export const isUnavailable = (error: unknown) =>
  (error as { code?: string } | null)?.code === 'unavailable';

/** Reads the fields a status change looks at, defaulting what an older thing lacks. */
export const toStored = (data: DocumentData): Stored => ({
  status: data.status ?? 'AVAILABLE',
  pending: data.pending ?? null,
  sale: data.sale ?? null,
  lastEditedBy: data.lastEditedBy ?? null,
  statusHistory: Array.isArray(data.statusHistory) ? data.statusHistory : [],
});

/** Takes the buyer's name out of the record once the sale's contacts are cleared. */
export const clearNext = (planned: Next, isCleared: boolean): Next => ({
  ...planned,
  pending: withoutBuyerName(planned.pending, isCleared),
  sale: withoutBuyerName(planned.sale, isCleared),
});

/** The fields to write on a thing for a planned change, its history entry included. */
export function toItemUpdate(
  current: Stored,
  next: Next,
  uid: string,
  now: number,
) {
  const hold =
    next.kind === 'MARK_PENDING' || next.kind === 'CHANGE_HOLD'
      ? next.pending
      : null;
  const change: StatusChange = {
    kind: next.kind,
    status: next.status,
    byUid: uid,
    at: now,
    priceCents: next.sale?.priceCents ?? null,
    fromPriceCents: next.fromPriceCents,
    buyerName: hold?.buyerName ?? null,
    pickupOn: hold?.pickupOn ?? null,
  };
  return {
    status: next.status,
    pending: next.pending,
    sale: next.sale,
    statusHistory: [...current.statusHistory, change].slice(
      -MAX_STATUS_HISTORY,
    ),
    lastEditedAt: now,
    lastEditedBy: uid,
  };
}

export const bundleRef = (saleId: string, bundleId: string) =>
  doc(db, 'apps', 'going-once', 'sales', saleId, 'bundles', bundleId);

/** What the change does to the bundle the thing belongs to, worked out from reads made before any write. */
type BundleEffect =
  | { kind: 'NONE' }
  | { kind: 'REFUSED'; message: string }
  | { kind: 'UPDATE'; update: Record<string, unknown> };

const NO_EFFECT: BundleEffect = { kind: 'NONE' };

const getAsking = (item: Item) => item.askingPriceCents ?? 0;

/** Why a thing held or sold with its bundle can't change on its own, or `null`. */
const getHeldMessage = (
  bundle: Bundle | null,
  itemId: string,
): string | null => {
  if (
    bundle === null ||
    bundle.status === 'ACTIVE' ||
    !bundle.itemIds.includes(itemId) ||
    !(bundle.dealItemIds ?? []).includes(itemId)
  )
    return null;
  return bundle.status === 'SOLD'
    ? `This was sold with the ${bundle.name} bundle. Change it from the bundle.`
    : `This is held with the ${bundle.name} bundle. Change it from the bundle.`;
};

/** The price drop or rise a bundled thing's own change causes; runs after the thing's status is known to be as expected. */
function planBundleEffect(
  bundle: Bundle | null,
  thing: Item,
  others: Item[],
  next: Next,
  transition: StatusTransition,
  uid: string,
  now: number,
): BundleEffect {
  if (bundle === null || !bundle.itemIds.includes(thing.id)) return NO_EFFECT;
  if (bundle.status !== 'ACTIVE') return NO_EFFECT;
  const othersAvailable = others.filter((item) => item.status === 'AVAILABLE');
  const dealBefore =
    othersAvailable.length + (thing.status === 'AVAILABLE' ? 1 : 0);
  if (
    (transition.kind === 'MARK_PENDING' || transition.kind === 'MARK_SOLD') &&
    isSoloLocked(thing, bundle, dealBefore)
  )
    return {
      kind: 'REFUSED',
      message: `This one is only sold with the ${bundle.name} bundle.`,
    };
  const isLeaving = thing.status === 'AVAILABLE' && next.status !== 'AVAILABLE';
  const isBack = thing.status !== 'AVAILABLE' && next.status === 'AVAILABLE';
  if (!isLeaving && !isBack) return NO_EFFECT;
  const separateAfter =
    othersAvailable.reduce((total, item) => total + getAsking(item), 0) +
    (next.status === 'AVAILABLE' ? getAsking(thing) : 0);
  const priceCents = adjustBundlePrice(
    bundle.priceCents,
    isLeaving ? -getAsking(thing) : getAsking(thing),
    separateAfter,
  );
  return {
    kind: 'UPDATE',
    update: {
      priceCents,
      history: appendBundleChange(
        bundle.history,
        {
          kind: isLeaving ? 'THING_LEFT' : 'THING_BACK',
          byUid: uid,
          at: now,
          itemId: thing.id,
          itemStatus: next.status,
          priceCents,
          fromPriceCents: bundle.priceCents,
        },
        MAX_STATUS_HISTORY,
      ),
      lastEditedAt: now,
      lastEditedBy: uid,
    },
  };
}

/**
 * Changes a thing's status in one transaction that re-reads the thing and refuses, in words, when the status it expected is gone.
 * A thing in a bundle also reads the bundle (and, while it is on offer, the other things), so the bundle price follows the change in the same commit.
 * It needs a connection on purpose: two people must never promise one thing from a stale screen.
 */
export async function changeStatus(
  saleId: string,
  itemId: string,
  uid: string,
  transition: StatusTransition,
): Promise<StatusResult> {
  if (!navigator.onLine) return { ok: false, message: OFFLINE_MESSAGE };
  if (!isValid(transition)) return { ok: false, message: INVALID_MESSAGE };
  const ref = doc(db, 'apps', 'going-once', 'sales', saleId, 'items', itemId);
  try {
    const outcome = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) return { kind: 'GONE' } as const;
      const saleData = (
        await transaction.get(doc(db, 'apps', 'going-once', 'sales', saleId))
      ).data();
      const isFinished = saleData?.status === FINISHED_SALE_STATUS;
      if (isFinished && HOLDS.includes(transition.kind))
        return { kind: 'REFUSED', message: FINISHED_MESSAGE } as const;
      const data = snapshot.data();
      const thing = toItem(itemId, saleId, data);
      const bundleSnapshot =
        thing.bundleId === null
          ? null
          : await transaction.get(bundleRef(saleId, thing.bundleId));
      const bundle = bundleSnapshot?.exists()
        ? toBundle(bundleSnapshot.id, saleId, bundleSnapshot.data())
        : null;
      const others =
        bundle === null || bundle.status !== 'ACTIVE'
          ? []
          : (
              await Promise.all(
                bundle.itemIds
                  .filter((id) => id !== itemId)
                  .map((id) =>
                    transaction.get(
                      doc(
                        db,
                        'apps',
                        'going-once',
                        'sales',
                        saleId,
                        'items',
                        id,
                      ),
                    ),
                  ),
              )
            )
              .filter((found) => found.exists())
              .map((found) => toItem(found.id, saleId, found.data()));
      const current = toStored(data);
      const heldMessage = getHeldMessage(bundle, itemId);
      if (heldMessage !== null)
        return { kind: 'REFUSED', message: heldMessage } as const;
      if (
        !EXPECTED[transition.kind].includes(current.status) ||
        !isUndoCurrent(current, transition) ||
        !isHoldUnchanged(current, transition)
      )
        return { kind: 'CONFLICT', current } as const;
      const now = Date.now();
      const planned = getNext(current, transition, uid, now);
      if (typeof planned === 'string')
        return { kind: 'REFUSED', message: planned } as const;
      const isCleared = isFinished && saleData?.contactsClearedAt != null;
      const next = clearNext(planned, isCleared);
      const effect = planBundleEffect(
        bundle,
        thing,
        others,
        next,
        transition,
        uid,
        now,
      );
      if (effect.kind === 'REFUSED')
        return { kind: 'REFUSED', message: effect.message } as const;
      transaction.update(ref, toItemUpdate(current, next, uid, now));
      if (effect.kind === 'UPDATE' && bundle !== null)
        transaction.update(bundleRef(saleId, bundle.id), effect.update);
      return { kind: 'DONE', at: now } as const;
    });
    if (outcome.kind === 'DONE') return { ok: true, at: outcome.at };
    if (outcome.kind === 'REFUSED')
      return { ok: false, message: outcome.message };
    if (outcome.kind === 'GONE') return { ok: false, message: GONE_MESSAGE };
    return {
      ok: false,
      message: await describeConflict(outcome.current, uid),
    };
  } catch (error) {
    return {
      ok: false,
      message: isUnavailable(error) ? OFFLINE_MESSAGE : GENERIC_MESSAGE,
    };
  }
}
