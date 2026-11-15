import type { SourceShares } from '@/lib/connections/contract';

export const RUNWAY_SHARES: SourceShares = {
  appId: 'runway',
  shares: [
    {
      id: 'app:runway',
      kind: 'firstPartyApp',
      contractVersion: 1,
      about:
        "Runway is the person's income-first budget planner: money arrives in pieces, and Runway plans where each paycheck goes to cover bills, goals and spending.",
      transformVersion: 1,
      categories: [
        {
          id: 'moneySummary',
          kind: 'moneySummary',
          label: 'Free to Spend',
          detail:
            'One total: what is free to spend now, the next income day and what is due before it',
          meaning:
            "Free to Spend is what is left of the person's money after bills and set-asides, until their next income day.",
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            {
              label: 'The amount free to spend',
              sinceVersion: 1,
              addedOn: null,
            },
            { label: 'The next income day', sinceVersion: 1, addedOn: null },
            { label: 'What is due before it', sinceVersion: 1, addedOn: null },
          ],
          scopeVersion: 1,
        },
        {
          id: 'upcomingBills',
          kind: 'task',
          label: 'Bills',
          detail:
            "Each bill: its name, amount, day, how often it repeats, when it ends and whether it's paid this month",
          meaning:
            'Bills the person pays: those falling due in the next 30 days, the next one of every other bill within a year, and those already paid this month, each with its amount, due day, how often it repeats, when it ends and the day it was paid.',
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
          reads: [
            { label: "Each bill's name", sinceVersion: 1, addedOn: null },
            { label: 'Its amount', sinceVersion: 1, addedOn: null },
            { label: 'The day it is due', sinceVersion: 1, addedOn: null },
            {
              label: 'Whether it is paid this month, and the day you paid it',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
            {
              label:
                'How often it repeats and when it ends, with bills due up to a year away',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 2,
        },
        {
          id: 'horizon',
          kind: 'project',
          label: 'Horizon goals',
          detail: 'Each goal: its name, target, what is set aside and its day',
          meaning:
            "Horizon goals are costs the person knows are coming, like a cat's surgery in December, that they plan paychecks around and set money aside for, each with a target and a day.",
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
          reads: [
            {
              label: "Each goal's name and day",
              sinceVersion: 1,
              addedOn: null,
            },
            { label: 'Its target amount', sinceVersion: 1, addedOn: null },
            { label: 'How much is set aside', sinceVersion: 1, addedOn: null },
          ],
          scopeVersion: 1,
        },
        {
          id: 'envelopes',
          kind: 'artifact',
          label: 'Envelopes',
          meaning:
            "Envelopes are the spending buckets the person's paychecks fill in Runway, such as groceries or gas; only their names are shared.",
          detail: "Each envelope's name, no amounts",
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 3,
          reads: [
            {
              label: "Each envelope's name",
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'transactions',
          kind: 'transaction',
          label: 'Transactions',
          detail: 'The date, who you paid, the amount and its category',
          meaning:
            'Money the person has spent, each with its date, who was paid, the amount and a spending category.',
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 2,
          reads: [
            {
              label: 'The date and who you paid',
              sinceVersion: 1,
              addedOn: null,
            },
            { label: 'The amount', sinceVersion: 1, addedOn: null },
            { label: 'Its category', sinceVersion: 1, addedOn: null },
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
