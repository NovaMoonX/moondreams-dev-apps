import { doc, getDoc, runTransaction } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { formatCentsShort } from '@/utils/moneyUtils';
import { MAX_STATUS_HISTORY } from '@apps/going-once/constants';
import type {
  Item,
  ItemPendingRecord,
  ItemSaleRecord,
  ItemStatus,
  PaymentMethod,
  StatusChange,
  StatusChangeKind,
} from '@apps/going-once/types';
import { toFirstName } from '@apps/going-once/utils/personName';

export type StatusTransition =
  | { kind: 'MARK_PENDING'; buyerName: string | null; pickupOn: number | null }
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
const GENERIC_MESSAGE = "The status didn't change. Try again.";
const GONE_MESSAGE = 'This thing is no longer here.';
const INVALID_MESSAGE = "That amount or day doesn't look right.";
const NO_SALE_MESSAGE = 'There is no sale to change.';
const SAME_PAID_MESSAGE = 'That is already what was paid.';
const SAME_HOLD_MESSAGE = 'That is already the hold.';

type Stored = Pick<
  Item,
  'status' | 'pending' | 'sale' | 'lastEditedBy' | 'statusHistory'
>;

interface Next {
  kind: StatusChangeKind;
  status: ItemStatus;
  pending: ItemPendingRecord | null;
  sale: ItemSaleRecord | null;
  fromPriceCents: number | null;
}

const isMoney = (cents: number) => Number.isInteger(cents) && cents >= 0;
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
  inquiryId: current.pending?.inquiryId ?? null,
  buyerName: transition.buyerName,
  pickupOn: transition.pickupOn,
  markedBy: current.pending?.markedBy ?? uid,
  markedAt: current.pending?.markedAt ?? now,
});

/** The record after the change, or a sentence when there is nothing to write. */
const getNext = (
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
        inquiryId: null,
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

const describeLiveStatus = (current: Stored): string => {
  if (current.status === 'SOLD')
    return `marked this sold for ${formatCentsShort(current.sale?.priceCents ?? 0)}`;
  if (current.status === 'PENDING') return 'marked this pending';
  if (current.status === 'WITHDRAWN') return 'took this off the list';
  return 'put this back to available';
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

const readActorName = (actor: string | null, uid: string): Promise<string> => {
  if (actor === null) return Promise.resolve('Someone');
  if (actor === uid) return Promise.resolve('You');
  return readFirstName(actor);
};

const describeConflict = async (
  current: Stored,
  uid: string,
): Promise<string> => {
  const who = await readActorName(getLastActor(current), uid);
  return `${who} already ${describeLiveStatus(current)}.`;
};

const isUnavailable = (error: unknown) =>
  (error as { code?: string } | null)?.code === 'unavailable';

/**
 * Changes a thing's status in one transaction that re-reads the thing and refuses, in words, when the status it expected is gone.
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
      const data = snapshot.data();
      const current: Stored = {
        status: data.status ?? 'AVAILABLE',
        pending: data.pending ?? null,
        sale: data.sale ?? null,
        lastEditedBy: data.lastEditedBy ?? null,
        statusHistory: Array.isArray(data.statusHistory)
          ? data.statusHistory
          : [],
      };
      if (
        !EXPECTED[transition.kind].includes(current.status) ||
        !isUndoCurrent(current, transition) ||
        !isHoldUnchanged(current, transition)
      )
        return { kind: 'CONFLICT', current } as const;
      const now = Date.now();
      const next = getNext(current, transition, uid, now);
      if (typeof next === 'string')
        return { kind: 'REFUSED', message: next } as const;
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
      transaction.update(ref, {
        status: next.status,
        pending: next.pending,
        sale: next.sale,
        statusHistory: [...current.statusHistory, change].slice(
          -MAX_STATUS_HISTORY,
        ),
        lastEditedAt: now,
        lastEditedBy: uid,
      });
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
