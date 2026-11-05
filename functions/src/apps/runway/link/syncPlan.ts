import { createHmac, hkdfSync } from 'node:crypto';

import type { NormalizedTransaction } from './provider.js';

const DEDUPE_INFO = 'runway-dedupe';
const DAY_MS = 86_400_000;
const CLOSING_SETTLE_DAYS = 15;

/** Derived from the plan's data key, so rotating a master key never changes a purchase's dedupe key. */
export const dedupeSubkey = (planKey: Buffer) =>
  Buffer.from(hkdfSync('sha256', planKey, Buffer.alloc(0), DEDUPE_INFO, 32));

export const makeDedupeKey = (
  subkey: Buffer,
  linkId: string,
  providerTransactionId: string,
) =>
  createHmac('sha256', subkey)
    .update(`${linkId}:${providerTransactionId}`)
    .digest('hex');

/** The same key always names the same document, so a replayed sync can never make a second one. */
export const purchaseIdFor = (dedupeKey: string) => dedupeKey.slice(0, 32);

export interface Target {
  accountId: string | null;
  cardId: string | null;
}

interface MappedAccount {
  providerAccountId: string;
  accountId: string | null;
  cardId: string | null;
  isSkipped: boolean;
}

/** The accounts and cards a link brings purchases into; a skipped or not yet matched bank account is left out. */
export const targetsByProviderAccount = (
  providerAccounts: readonly MappedAccount[],
): Map<string, Target> =>
  new Map(
    providerAccounts.flatMap((entry): [string, Target][] =>
      !entry.isSkipped && (entry.accountId !== null || entry.cardId !== null)
        ? [
            [
              entry.providerAccountId,
              { accountId: entry.accountId, cardId: entry.cardId },
            ],
          ]
        : [],
    ),
  );

export interface PurchaseLine {
  envelopeId: string | null;
  cents: number;
  via: string;
}

export interface PurchasePayload {
  amountCents: number;
  merchant: string | null;
  lines: PurchaseLine[];
  paidByCardId: string | null;
  [key: string]: unknown;
}

/** A purchase as the sync sees it: the readable fields and the opened sealed payload. */
export interface PurchaseState {
  docId: string;
  dedupeKey: string;
  date: number;
  status: 'pending' | 'posted';
  needsHome: boolean;
  accountId: string | null;
  payload: PurchasePayload;
  isNew: boolean;
  isChanged: boolean;
}

/** Money out waits against Free to Spend until it has a home; money in counts for nothing until it is matched. */
export const waitingLines = (amountCents: number): PurchaseLine[] =>
  amountCents > 0
    ? [{ envelopeId: null, cents: amountCents, via: 'free' }]
    : [];

/** A changed amount (a tip added when it posts) goes to the last line, so the lines still add up to the amount. */
export function repriceLines(
  lines: readonly PurchaseLine[],
  before: number,
  after: number,
): PurchaseLine[] {
  if (lines.length === 0 || before === after) return [...lines];
  return lines.map((line, index) =>
    index === lines.length - 1
      ? { ...line, cents: line.cents + (after - before) }
      : line,
  );
}

/** The document ids a batch of changes may touch, so they can be read once before it is applied. */
export function neededDocIds(
  keyOf: (providerTransactionId: string) => string,
  changed: readonly NormalizedTransaction[],
  removed: readonly string[],
): string[] {
  const ids = [
    ...changed.flatMap((tx) => [
      purchaseIdFor(keyOf(tx.providerTransactionId)),
      ...(tx.pendingTransactionId
        ? [purchaseIdFor(keyOf(tx.pendingTransactionId))]
        : []),
    ]),
    ...removed.map((id) => purchaseIdFor(keyOf(id))),
  ];
  return [...new Set(ids)];
}

export interface SyncOutcome {
  /** Every document the batch leaves changed (a state) or deleted (null). */
  writes: Map<string, PurchaseState | null>;
  created: number;
  updated: number;
  removed: number;
  dropped: number;
  /** Days a purchase was written on, before and after, for the closings. */
  touchedDates: number[];
}

function upsert(
  tx: NormalizedTransaction,
  key: string,
  pendingKey: string | null,
  target: Target,
  states: Map<string, PurchaseState>,
): { state: PurchaseState; before: PurchaseState | null } {
  const ownId = purchaseIdFor(key);
  const pendingId = pendingKey === null ? null : purchaseIdFor(pendingKey);
  const current =
    states.get(ownId) ??
    (pendingId === null ? undefined : states.get(pendingId));
  if (!current) {
    const state: PurchaseState = {
      docId: ownId,
      dedupeKey: key,
      date: tx.date,
      status: tx.isPending ? 'pending' : 'posted',
      needsHome: true,
      accountId: target.accountId,
      payload: {
        amountCents: tx.amountCents,
        merchant: tx.merchant,
        label: null,
        note: null,
        lines: waitingLines(tx.amountCents),
        refundOfId: null,
        paidByCardId: target.cardId,
        link: null,
        receiptText: null,
        costRef: null,
      },
      isNew: true,
      isChanged: true,
    };
    return { state, before: null };
  }
  const next: PurchaseState = {
    ...current,
    date: tx.date,
    status: tx.isPending ? 'pending' : 'posted',
    payload: {
      ...current.payload,
      amountCents: tx.amountCents,
      merchant: current.needsHome ? tx.merchant : current.payload.merchant,
      lines: current.needsHome
        ? waitingLines(tx.amountCents)
        : repriceLines(
            current.payload.lines,
            current.payload.amountCents,
            tx.amountCents,
          ),
    },
  };
  const isChanged =
    next.date !== current.date ||
    next.status !== current.status ||
    next.payload.amountCents !== current.payload.amountCents ||
    next.payload.merchant !== current.payload.merchant;
  return {
    state: { ...next, isChanged: current.isChanged || isChanged },
    before: current,
  };
}

/**
 * Applies one batch of the provider's changes to the purchases already stored (`existing`, keyed by document id).
 * A posted charge whose pending twin is stored updates that document, keeping what the person decided about it.
 */
export function applyTransactions(
  keyOf: (providerTransactionId: string) => string,
  targets: ReadonlyMap<string, Target>,
  added: readonly NormalizedTransaction[],
  modified: readonly NormalizedTransaction[],
  removed: readonly string[],
  existing: ReadonlyMap<string, PurchaseState>,
): SyncOutcome {
  const states = new Map(existing);
  const writes = new Map<string, PurchaseState | null>();
  const counts = { removed: 0, dropped: 0 };
  const touchedDates: number[] = [];

  [...added, ...modified].forEach((tx) => {
    const target = targets.get(tx.providerAccountId);
    if (!target) {
      counts.dropped += 1;
      return;
    }
    const pendingKey = tx.pendingTransactionId
      ? keyOf(tx.pendingTransactionId)
      : null;
    const { state, before } = upsert(
      tx,
      keyOf(tx.providerTransactionId),
      pendingKey,
      target,
      states,
    );
    if (before === null || state.date !== before.date) {
      touchedDates.push(state.date, ...(before ? [before.date] : []));
    }
    states.set(state.docId, state);
    writes.set(state.docId, state);
  });

  removed.forEach((providerTransactionId) => {
    const docId = purchaseIdFor(keyOf(providerTransactionId));
    const state = states.get(docId);
    if (!state || !state.needsHome || state.status !== 'pending') return;
    counts.removed += 1;
    touchedDates.push(state.date);
    states.delete(docId);
    if (state.isNew) writes.delete(docId);
    else writes.set(docId, null);
  });

  const kept = new Map(
    [...writes].filter(
      ([, state]) => state === null || state.isNew || state.isChanged,
    ),
  );
  const present = [...kept.values()].flatMap((state) => (state ? [state] : []));
  const result: SyncOutcome = {
    writes: kept,
    touchedDates,
    created: present.filter((state) => state.isNew).length,
    updated: present.filter((state) => !state.isNew).length,
    ...counts,
  };
  return result;
}

const toMonthKey = (date: number) => {
  const value = new Date(date);
  return `${String(value.getUTCFullYear()).padStart(4, '0')}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
};

const previousMonth = (month: string) => {
  const [year, number] = month.split('-').map(Number);
  return toMonthKey(Date.UTC(year, number - 2, 1));
};

/** The earliest month a closing may already hold that these days touch, merged with `current`; null when none is touched. Mirrors the app's own mark so a write into a closed month reopens it. */
export function getDirtyFrom(
  current: string | null,
  dates: readonly number[],
  today: number,
): string | null {
  const lastClosable = previousMonth(
    toMonthKey(today + 2 * DAY_MS - CLOSING_SETTLE_DAYS * DAY_MS),
  );
  const closed = dates.map(toMonthKey).filter((month) => month <= lastClosable);
  if (closed.length === 0) return null;
  return [...(current === null ? [] : [current]), ...closed].sort()[0];
}
