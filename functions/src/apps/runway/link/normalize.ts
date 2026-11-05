import type {
  AccountKind,
  NormalizedAccount,
  NormalizedTransaction,
} from './provider.js';

const toKind = (type: string): AccountKind =>
  type === 'depository' || type === 'credit' ? type : 'other';

const toCents = (amount: number | null | undefined) =>
  typeof amount === 'number' && Number.isFinite(amount)
    ? Math.round(amount * 100)
    : null;

export interface RawAccount {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalance: number | null;
}

/** A credit account's current balance is already what is owed, so both kinds keep the sign the provider reports. */
export function normalizeAccount(raw: RawAccount): NormalizedAccount {
  const result: NormalizedAccount = {
    providerAccountId: raw.id,
    name: raw.name.trim() || 'Account',
    kind: toKind(raw.type),
    subtype: raw.subtype || null,
    mask: raw.mask || null,
    balanceCents: toCents(raw.currentBalance),
  };
  return result;
}

export interface RawTransaction {
  id: string;
  pendingId: string | null;
  accountId: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Dollars, positive when money leaves the account (the provider's own sign). */
  amount: number;
  merchantName: string | null;
  name: string | null;
  isPending: boolean;
}

/** Plaid already reports money out as positive and money in (a deposit, a refund) as negative, which is the app's sign, so cents keep it. */
export const toTransactionCents = (amount: number) => Math.round(amount * 100);

/** Null when the provider's date is not a real day. */
export function toDateOnly(date: string): number | null {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parsed) return null;
  const value = Date.UTC(
    Number(parsed[1]),
    Number(parsed[2]) - 1,
    Number(parsed[3]),
  );
  return Number.isNaN(value) ? null : value;
}

export function normalizeTransaction(
  raw: RawTransaction,
): NormalizedTransaction | null {
  const date = toDateOnly(raw.date);
  if (date === null || !Number.isFinite(raw.amount)) return null;
  const result: NormalizedTransaction = {
    providerTransactionId: raw.id,
    pendingTransactionId: raw.pendingId || null,
    providerAccountId: raw.accountId,
    date,
    amountCents: toTransactionCents(raw.amount),
    merchant: raw.merchantName?.trim() || raw.name?.trim() || null,
    isPending: raw.isPending,
  };
  return result;
}
