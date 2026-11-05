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

/** What the provider lets the server act with later; sealed before it is stored and never returned to a client. */
export interface ProviderGrant {
  credential: string;
  providerItemId: string;
}

export type ProviderErrorKind =
  'unavailable' | 'rejected' | 'needsAttention' | 'limit';

/** A provider failure with a sentence that is safe to show the person. */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  constructor(kind: ProviderErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface BankDataProvider {
  createLinkSession(uid: string): Promise<{ linkToken: string }>;
  exchange(publicToken: string): Promise<ProviderGrant>;
  /** The institution's name, or null when the provider cannot say. */
  getInstitutionName(grant: ProviderGrant): Promise<string | null>;
  /** Every account under the grant, with live balances. */
  listAccounts(grant: ProviderGrant): Promise<NormalizedAccount[]>;
  revoke(grant: ProviderGrant): Promise<void>;
}
