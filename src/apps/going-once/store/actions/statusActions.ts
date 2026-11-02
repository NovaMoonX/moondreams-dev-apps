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
} from '@apps/going-once/types';
import { toFirstName } from '@apps/going-once/utils/personName';

export type StatusTransition =
  | { kind: 'MARK_PENDING'; buyerName: string | null; pickupOn: number | null }
  | { kind: 'BACK_TO_AVAILABLE' }
  | {
      kind: 'MARK_SOLD';
      priceCents: number;
      method: PaymentMethod | null;
      soldOn: number;
    }
  | { kind: 'NOT_SOLD' }
  | { kind: 'TAKE_OFF' }
  | { kind: 'PUT_BACK'; restorePending: ItemPendingRecord | null }
  | { kind: 'CHANGE_PAID'; priceCents: number };

export type StatusResult = { ok: true } | { ok: false; message: string };

/** The statuses a thing may be in for each change; the transaction re-checks them against its own read. */
const EXPECTED: Record<StatusTransition['kind'], ItemStatus[]> = {
  MARK_PENDING: ['AVAILABLE'],
  BACK_TO_AVAILABLE: ['PENDING'],
  MARK_SOLD: ['AVAILABLE', 'PENDING'],
  NOT_SOLD: ['SOLD'],
  TAKE_OFF: ['AVAILABLE', 'PENDING'],
  PUT_BACK: ['WITHDRAWN'],
  CHANGE_PAID: ['SOLD'],
};

export const OFFLINE_MESSAGE = 'Changing the status needs a connection.';
const GENERIC_MESSAGE = "The status didn't change. Try again.";
const GONE_MESSAGE = 'This thing is no longer here.';

type Stored = Pick<
  Item,
  'status' | 'pending' | 'sale' | 'lastEditedBy' | 'statusHistory'
>;

interface Next {
  status: ItemStatus;
  pending: ItemPendingRecord | null;
  sale: ItemSaleRecord | null;
  fromPriceCents: number | null;
}

const getNext = (
  current: Stored,
  transition: StatusTransition,
  uid: string,
  now: number,
): Next => {
  const keep: Next = {
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
  if (transition.kind === 'CHANGE_PAID')
    return current.sale === null
      ? keep
      : {
          ...keep,
          sale: { ...current.sale, priceCents: transition.priceCents },
          fromPriceCents: current.sale.priceCents,
        };
  if (transition.kind === 'NOT_SOLD')
    return { ...keep, status: 'AVAILABLE', sale: null };
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

const describeConflict = async (
  current: Stored,
  uid: string,
): Promise<string> => {
  const actor = getLastActor(current);
  const who =
    actor === null
      ? 'Someone'
      : actor === uid
        ? 'You'
        : await readFirstName(actor);
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
      if (!EXPECTED[transition.kind].includes(current.status))
        return { kind: 'CONFLICT', current } as const;
      const now = Date.now();
      const next = getNext(current, transition, uid, now);
      const change: StatusChange = {
        status: next.status,
        byUid: uid,
        at: now,
        priceCents: next.sale?.priceCents ?? null,
        fromPriceCents: next.fromPriceCents,
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
      return { kind: 'DONE' } as const;
    });
    if (outcome.kind === 'DONE') return { ok: true };
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
