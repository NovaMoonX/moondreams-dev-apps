import type { SourceShares } from '@/lib/connections/contract';

export const RUNWAY_SHARES: SourceShares = {
  appId: 'runway',
  shares: [
    {
      id: 'app:runway',
      kind: 'firstPartyApp',
      contractVersion: 1,
      transformVersion: 1,
      categories: [
        {
          id: 'moneySummary',
          kind: 'moneySummary',
          label: 'Free to Spend',
          detail:
            'One total: what is free to spend now, the next income day and what is due before it',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
        },
        {
          id: 'upcomingBills',
          kind: 'task',
          label: 'Bills coming up',
          detail: 'Each bill due in the next 30 days: its name, amount and day',
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
        },
        {
          id: 'horizon',
          kind: 'project',
          label: 'Horizon goals',
          detail: 'Each goal: its name, target, what is set aside and its day',
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
        },
      ],
      never: [
        'transactions',
        'accounts and balances',
        'cards',
        'income sources',
        'receipts and notes',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
