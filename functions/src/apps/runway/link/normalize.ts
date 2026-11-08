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

const toEpoch = (iso: string | null) => {
  const epoch = iso === null ? NaN : Date.parse(iso);
  return Number.isFinite(epoch) ? epoch : null;
};

export interface RawAccount {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalance: number | null;
  /** ISO time the bank last refreshed the balance; null when the provider does not say. */
  balanceUpdatedAt: string | null;
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
    balanceAsOf: toEpoch(raw.balanceUpdatedAt),
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
  logoUrl?: string | null;
  name: string | null;
  category?: string | null;
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

export const toHttpsUrl = (value: string | null | undefined) => {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
};

/** The bank's description, only when a merchant name stands in front of it and says something else. */
export const toBankName = (
  merchantName: string | null | undefined,
  name: string | null | undefined,
) => {
  const merchant = merchantName?.trim() || null;
  const bank = name?.trim().slice(0, 200) || null;
  return merchant !== null &&
    bank !== null &&
    merchant.toLowerCase() !== bank.toLowerCase()
    ? bank
    : null;
};

export function normalizeTransaction(
  raw: RawTransaction,
): NormalizedTransaction | null {
  const date = toDateOnly(raw.date);
  if (date === null || !Number.isFinite(raw.amount)) return null;
  if (toTransactionCents(raw.amount) === 0) return null;
  const result: NormalizedTransaction = {
    providerTransactionId: raw.id,
    pendingTransactionId: raw.pendingId || null,
    providerAccountId: raw.accountId,
    date,
    amountCents: toTransactionCents(raw.amount),
    merchant: raw.merchantName?.trim() || raw.name?.trim() || null,
    merchantLogo: toHttpsUrl(raw.logoUrl),
    bankName: toBankName(raw.merchantName, raw.name),
    category: raw.category?.trim().toUpperCase() || null,
    isPending: raw.isPending,
  };
  return result;
}
