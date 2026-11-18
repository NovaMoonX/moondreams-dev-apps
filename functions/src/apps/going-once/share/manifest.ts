// Generated from src/apps/going-once/share/manifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { SourceShares } from '../../../vendor/connectionsContract.js';

export const GOING_ONCE_SHARES: SourceShares = {
  appId: 'going-once',
  shares: [
    {
      id: 'app:going-once',
      kind: 'firstPartyApp',
      contractVersion: 1,
      about:
        "Going Once is the person's app for selling their belongings: a sale holds things for sale, each marked available, pending or sold, and buyers collect what they bought.",
      transformVersion: 1,
      categories: [
        {
          id: 'pickups',
          kind: 'event',
          label: 'Pickups',
          detail: 'The thing and the day',
          meaning:
            "Things a buyer has agreed to buy and will collect on a set day, each from one of the person's sales.",
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            {
              label: 'The thing waiting for pickup',
              sinceVersion: 1,
              addedOn: null,
            },
            { label: "Its sale's name", sinceVersion: 1, addedOn: null },
            { label: 'The pickup day', sinceVersion: 1, addedOn: null },
          ],
          scopeVersion: 1,
        },
        {
          id: 'sales',
          kind: 'project',
          label: 'Your sales',
          detail: 'Each sale and how many are available, pending and sold',
          meaning:
            "The person's open sales, each a group of things they are letting go of, with how many are still available, pending or sold.",
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            { label: "Each open sale's name", sinceVersion: 1, addedOn: null },
            {
              label: 'How many things are available, pending and sold',
              sinceVersion: 1,
              addedOn: null,
            },
            {
              label: 'Where buyers pick up',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
            {
              label: 'Your note to buyers and how they can pay',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
            {
              label: 'The days buyers can pick up',
              sinceVersion: 3,
              addedOn: '2026-11-15',
            },
            {
              label: 'How many messages are waiting on you',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
            {
              label: "Money collected and what's left to sell",
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 3,
        },
        {
          id: 'things',
          kind: 'artifact',
          label: 'Your things',
          meaning:
            'The belongings the person has put up for sale, each with its asking price.',
          detail: "What's for sale and its asking price",
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 2,
          reads: [
            {
              label: 'Each thing for sale',
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
            {
              label: 'Its asking price',
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
            {
              label: "Whether it's available or pending",
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'allThings',
          kind: 'artifact',
          label: 'Everything in your sales',
          detail:
            'Every thing, drafts included, with its state, prices, condition and notes',
          meaning:
            "Every belonging in the person's sales, drafts and ones not ready for buyers included, each with its state, asking and lowest price, condition, private notes and when its status last changed. Never where it was bought or who the buyer is.",
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 4,
          reads: [
            {
              label:
                'Each thing, with its sale and whether it is a draft, available, pending, sold or taken off',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'Its asking price and the lowest price you would take',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'Its condition and your private notes',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'When its status last changed',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'questions',
          kind: 'event',
          label: "Buyers' questions",
          detail:
            "The thing, the buyer's first name, their message and whether it is handled",
          meaning:
            "Messages buyers sent about a thing, each with the thing, the buyer's first name, what they wrote, whether it is new or handled and when it came in. Never a buyer's email, phone or full name.",
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 4,
          reads: [
            {
              label: 'The thing a buyer asked about and when',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: "The buyer's first name",
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label:
                'Their message, unless it holds a link, email or phone number',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'Whether it is new or handled',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
      ],
      never: [
        "buyers' emails, phone numbers and full names",
        'where things were bought',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
