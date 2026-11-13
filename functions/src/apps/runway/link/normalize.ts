import type {
  AccountKind,
  NormalizedAccount,
  NormalizedCardStatement,
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
  availableBalance: number | null;
  limit: number | null;
  hasInstantBalance: boolean;
  /** ISO time the bank last refreshed the balance; null when the provider does not say. */
  balanceUpdatedAt: string | null;
}

/** A credit account's current balance is already what is owed, so both kinds keep the sign the provider reports. A card's available figure is credit left, not money, so only a bank account keeps it. */
export function normalizeAccount(raw: RawAccount): NormalizedAccount {
  const kind = toKind(raw.type);
  const result: NormalizedAccount = {
    providerAccountId: raw.id,
    name: raw.name.trim() || 'Account',
    kind,
    subtype: raw.subtype || null,
    mask: raw.mask || null,
    balanceCents: toCents(raw.currentBalance),
    balanceAsOf: toEpoch(raw.balanceUpdatedAt),
    availableCents:
      kind === 'depository' ? toCents(raw.availableBalance) : null,
    limitCents: kind === 'credit' ? toCents(raw.limit) : null,
    hasInstantBalance: raw.hasInstantBalance,
  };
  return result;
}

/** What an account's stored bank balance seals; null when the bank gave no balance. */
export const toBalanceSealed = (account: NormalizedAccount) =>
  account.balanceCents === null
    ? null
    : {
        cents: account.balanceCents,
        availableCents: account.availableCents,
        limitCents: account.limitCents,
        hasInstantBalance: account.hasInstantBalance,
      };

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

export interface RawCardStatement {
  accountId: string;
  /** Dollars. */
  minimumPayment: number | null;
  lastStatementBalance: number | null;
  /** `YYYY-MM-DD`. */
  lastStatementIssueDate: string | null;
  nextPaymentDueDate: string | null;
  lastPaymentAmount: number | null;
  lastPaymentDate: string | null;
}

const toNonNegativeCents = (amount: number | null | undefined) => {
  const cents = toCents(amount);
  return cents !== null && cents >= 0 ? cents : null;
};

const toOptionalDay = (date: string | null | undefined) =>
  typeof date === 'string' ? toDateOnly(date) : null;

export function normalizeCardStatement(
  raw: RawCardStatement,
): NormalizedCardStatement {
  const result: NormalizedCardStatement = {
    providerAccountId: raw.accountId,
    minimumCents: toNonNegativeCents(raw.minimumPayment),
    statementCents: toNonNegativeCents(raw.lastStatementBalance),
    statementOn: toOptionalDay(raw.lastStatementIssueDate),
    dueOn: toOptionalDay(raw.nextPaymentDueDate),
    lastPaymentCents: toNonNegativeCents(raw.lastPaymentAmount),
    lastPaymentOn: toOptionalDay(raw.lastPaymentDate),
  };
  return result;
}
