import type { AccountKind, NormalizedAccount } from './provider.js';

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
