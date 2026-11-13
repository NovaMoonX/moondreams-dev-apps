// Generated from src/apps/going-once/share/manifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { SourceShares } from '../../../vendor/connectionsContract.js';

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
        },
        {
          id: 'sales',
          kind: 'project',
          label: 'Your sales',
          detail: 'Each sale and how many are available, pending and sold',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
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
