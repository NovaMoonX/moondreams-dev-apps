import { randomUUID } from 'node:crypto';

import type {
  BankDataProvider,
  NormalizedAccount,
  NormalizedTransaction,
  TransactionSync,
} from './provider.js';

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

const DAY_MS = 86_400_000;

const daysAgo = (days: number) => {
  const now = new Date();
  return (
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
    days * DAY_MS
  );
};

const transaction = (
  providerTransactionId: string,
  providerAccountId: string,
  days: number,
  amountCents: number,
  merchant: string,
  extra: Partial<NormalizedTransaction> = {},
): NormalizedTransaction => ({
  providerTransactionId,
  pendingTransactionId: null,
  providerAccountId,
  date: daysAgo(days),
  amountCents,
  merchant,
  isPending: false,
  ...extra,
});

const FIRST_PAGE: NormalizedTransaction[] = [
  transaction(
    'stand-in-t1',
    'stand-in-sapphire',
    3,
    5_432,
    'Trader Joe\u2019s',
  ),
  transaction('stand-in-t2', 'stand-in-sapphire', 6, 4_110, 'Shell'),
  transaction(
    'stand-in-t3-pending',
    'stand-in-sapphire',
    1,
    675,
    'Blue Bottle Coffee',
    {
      isPending: true,
    },
  ),
  transaction('stand-in-t4', 'stand-in-sapphire', 12, 1_549, 'Netflix'),
  transaction('stand-in-t5', 'stand-in-checking', 8, -215_000, 'Payroll'),
  transaction('stand-in-t6', 'stand-in-checking', 10, 8_820, 'Costco'),
];

/** The pending coffee posts a little higher, with its pending id, and the pending one goes away. */
const POSTED_COFFEE = transaction(
  'stand-in-t3',
  'stand-in-sapphire',
  1,
  750,
  'Blue Bottle Coffee',
  {
    pendingTransactionId: 'stand-in-t3-pending',
  },
);

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
  syncTransactions: async (_grant, cursor) => {
    const result: TransactionSync =
      cursor === null
        ? {
            added: FIRST_PAGE,
            modified: [],
            removed: [],
            nextCursor: 'stand-in-1',
            hasMore: false,
          }
        : cursor === 'stand-in-1'
          ? {
              added: [POSTED_COFFEE],
              modified: [],
              removed: ['stand-in-t3-pending'],
              nextCursor: 'stand-in-2',
              hasMore: false,
            }
          : {
              added: [],
              modified: [],
              removed: [],
              nextCursor: cursor,
              hasMore: false,
            };
    return result;
  },
};
