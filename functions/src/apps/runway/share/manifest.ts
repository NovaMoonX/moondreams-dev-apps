// Generated from src/apps/runway/share/manifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { SourceShares } from '../../../vendor/connectionsContract.js';

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
            'Bills the person pays: what is due in the next 30 days, the next payment of each other bill within a year, and what was already paid this month, each with its amount, due day, how often it repeats, when it ends and the day it was paid.',
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
        {
          id: 'envelopeBalances',
          kind: 'artifact',
          label: 'Envelope spending',
          detail: "Each envelope's name and what was spent from it this month",
          meaning:
            'How much the person has spent from each envelope, such as groceries or gas, in a month or a stretch of days they ask about; what is left in an envelope is not shared, only what was spent. Read only when asked.',
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 4,
          reads: [
            {
              label: "Each envelope's name",
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'What was spent from it this month',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'accountBalances',
          kind: 'artifact',
          label: 'Account balances',
          detail: "Each account's name and its balance",
          meaning:
            "The accounts where the person's money is held, each with the balance the bank or the person last gave and a total of those they count toward their own. Money, sent only with its currency and when asked; account numbers never.",
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 4,
          reads: [
            {
              label: "Each account's name and kind",
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'Its balance and the day it was given',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'Whether it counts toward their total',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'cardsDue',
          kind: 'task',
          label: 'Cards due',
          detail: "Each card's name, the amount owed and its due date",
          meaning:
            'The credit cards the person pays, each with its next due day and, when the bank gave a statement, what it says is owed. Money, sent only with its currency and when asked; card numbers never.',
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 4,
          reads: [
            {
              label: "Each card's name",
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'The day its next payment is due',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'The amount on its latest statement',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
      ],
      never: [
        'account and card numbers',
        'income sources',
        'receipts and notes',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
