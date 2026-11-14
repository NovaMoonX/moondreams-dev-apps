// Generated from src/apps/runway/share/manifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { SourceShares } from '../../../vendor/connectionsContract.js';

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
          reads: [
            { label: 'The amount free to spend', sinceVersion: 1 },
            { label: 'The next income day', sinceVersion: 1 },
            { label: 'What is due before it', sinceVersion: 1 },
          ],
          scopeVersion: 1,
        },
        {
          id: 'upcomingBills',
          kind: 'task',
          label: 'Bills coming up',
          detail: 'Each bill due in the next 30 days: its name, amount and day',
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
          reads: [
            { label: "Each bill's name", sinceVersion: 1 },
            { label: 'Its amount', sinceVersion: 1 },
            { label: 'The day it is due', sinceVersion: 1 },
          ],
          scopeVersion: 1,
        },
        {
          id: 'horizon',
          kind: 'project',
          label: 'Horizon goals',
          detail: 'Each goal: its name, target, what is set aside and its day',
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
          reads: [
            { label: "Each goal's name and day", sinceVersion: 1 },
            { label: 'Its target amount', sinceVersion: 1 },
            { label: 'How much is set aside', sinceVersion: 1 },
          ],
          scopeVersion: 1,
        },
        {
          id: 'transactions',
          kind: 'transaction',
          label: 'Transactions',
          detail: 'The date, who you paid, the amount and its category',
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 2,
          reads: [
            { label: 'The date and who you paid', sinceVersion: 1 },
            { label: 'The amount', sinceVersion: 1 },
            { label: 'Its category', sinceVersion: 1 },
          ],
          scopeVersion: 1,
        },
      ],
      never: [
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
