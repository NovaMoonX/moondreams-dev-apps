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
          scopeVersion: 2,
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
      ],
      never: [
        "buyers' names, contacts and messages",
        'floor prices',
        'private notes',
        'where things were bought',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
