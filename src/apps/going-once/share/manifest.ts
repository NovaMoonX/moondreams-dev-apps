import type { SourceShares } from '@/lib/connections/contract';

export const GOING_ONCE_SHARES: SourceShares = {
  appId: 'going-once',
  shares: [
    {
      id: 'app:going-once',
      kind: 'firstPartyApp',
      contractVersion: 1,
      transformVersion: 1,
      categories: [
        {
          id: 'pickups',
          kind: 'event',
          label: 'Pickups',
          detail: 'The thing and the day',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            { label: 'The thing waiting for pickup', sinceVersion: 1 },
            { label: "Its sale's name", sinceVersion: 1 },
            { label: 'The pickup day', sinceVersion: 1 },
          ],
          scopeVersion: 1,
        },
        {
          id: 'sales',
          kind: 'project',
          label: 'Your sales',
          detail: 'Each sale and how many are available, pending and sold',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            { label: "Each open sale's name", sinceVersion: 1 },
            {
              label: 'How many things are available, pending and sold',
              sinceVersion: 1,
            },
          ],
          scopeVersion: 1,
        },
      ],
      never: [
        "buyers' names, contacts and messages",
        'floor prices',
        'private notes',
        'prices paid',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
