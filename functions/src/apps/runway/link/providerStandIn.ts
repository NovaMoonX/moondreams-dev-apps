import { randomUUID } from 'node:crypto';

import type { BankDataProvider, NormalizedAccount } from './provider.js';

export const STAND_IN_LINK_TOKEN = 'fake-link-token';

const ACCOUNTS: NormalizedAccount[] = [
  {
    providerAccountId: 'stand-in-sapphire',
    name: 'Sapphire Preferred',
    kind: 'credit',
    subtype: 'credit card',
    mask: '6604',
    balanceCents: 31_275,
  },
  {
    providerAccountId: 'stand-in-checking',
    name: 'Total Checking',
    kind: 'depository',
    subtype: 'checking',
    mask: '2290',
    balanceCents: 182_640,
  },
];

/** A bank that answers without a network, for the Functions emulator when no provider keys are set. Emulators only. */
export const standInProvider: BankDataProvider = {
  createLinkSession: async () => ({ linkToken: STAND_IN_LINK_TOKEN }),
  exchange: async () => ({
    credential: 'stand-in',
    providerItemId: `stand-in-${randomUUID()}`,
  }),
  getInstitutionName: async () => 'Chase',
  listAccounts: async () => ACCOUNTS,
  revoke: async () => undefined,
};
