// Generated from src/apps/waypoint/share/manifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { SourceShares } from '../../../vendor/connectionsContract.js';

export const WAYPOINT_SHARES: SourceShares = {
  appId: 'waypoint',
  shares: [
    {
      id: 'app:waypoint',
      kind: 'firstPartyApp',
      contractVersion: 1,
      transformVersion: 1,
      categories: [
        {
          id: 'trips',
          kind: 'trip',
          label: 'Your trips',
          detail: 'Name, dates and where',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
        },
        {
          id: 'itinerary',
          kind: 'event',
          label: 'Trip plans',
          detail:
            'Activities, flights, drives, stays and rentals, at their local times',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
        },
        {
          id: 'myTasks',
          kind: 'task',
          label: 'Your trip to-dos',
          detail: 'Before the Road tasks assigned to you or private to you',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
        },
        {
          id: 'tripBalances',
          kind: 'moneySummary',
          label: 'What you owe and are owed',
          detail: 'One line per trip: what you owe and what you are owed',
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
        },
      ],
      never: [
        "other members' private to-dos",
        'contact details',
        'suggestions',
        'expense lines',
        'receipts',
        'the album',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
