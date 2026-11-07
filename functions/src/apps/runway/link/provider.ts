export const LINK_STATUSES = ['active', 'needsAttention', 'revoked'] as const;

export type AccountKind = 'depository' | 'credit' | 'other';

export interface NormalizedAccount {
  providerAccountId: string;
  name: string;
  kind: AccountKind;
  subtype: string | null;
  mask: string | null;
  /** For a credit account, what is owed, as a positive number. */
  balanceCents: number | null;
}

/** A bank transaction in the shape the app uses; money out is positive, money in negative. */
export interface NormalizedTransaction {
  providerTransactionId: string;
  /** For a posted charge, the id the same charge had while it was pending. */
  pendingTransactionId: string | null;
  providerAccountId: string;
  /** Date-only: UTC midnight of the transaction's day. */
  date: number;
  amountCents: number;
  merchant: string | null;
  /** The provider's detailed kind of place (`FOOD_AND_DRINK_RESTAURANT`); null when it gives none. */
  category: string | null;
  isPending: boolean;
}

export interface TransactionSync {
  added: NormalizedTransaction[];
  modified: NormalizedTransaction[];
  /** Provider transaction ids. */
  removed: string[];
  nextCursor: string;
  hasMore: boolean;
}

/** What the provider lets the server act with later; sealed before it is stored and never returned to a client. */
export interface ProviderGrant {
  credential: string;
  providerItemId: string;
}

export type ProviderErrorKind =
  'unavailable' | 'rejected' | 'needsAttention' | 'limit';

/** A provider's error code when it looks like one, so a log never holds free text. */
export const asProviderCode = (value: unknown): string | null =>
  typeof value === 'string' && /^[A-Z_]{1,64}$/.test(value) ? value : null;

/** A provider failure with a sentence that is safe to show the person, and the provider's own error code for the logs. */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly code: string | null;
  constructor(
    kind: ProviderErrorKind,
    message: string,
    code: string | null = null,
  ) {
    super(message);
    this.kind = kind;
    this.code = code;
  }
}

export interface ProviderInstitution {
  name: string | null;
  logo: string | null;
}

export interface BankDataProvider {
  createLinkSession(uid: string): Promise<{ linkToken: string }>;
  exchange(publicToken: string): Promise<ProviderGrant>;
  /** The institution's name and logo (a PNG data URL), or null when the provider cannot say. */
  getInstitution(grant: ProviderGrant): Promise<ProviderInstitution | null>;
  /** Every account under the grant, with live balances. */
  listAccounts(grant: ProviderGrant): Promise<NormalizedAccount[]>;
  revoke(grant: ProviderGrant): Promise<void>;
  /** One page of changes since `cursor` (null for the first sync). */
  syncTransactions(
    grant: ProviderGrant,
    cursor: string | null,
  ): Promise<TransactionSync>;
}
