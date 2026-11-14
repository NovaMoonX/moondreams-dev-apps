// Generated from src/apps/a-list/share/manifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { SourceShares } from '../../../vendor/connectionsContract.js';

export const A_LIST_SHARES: SourceShares = {
  appId: 'a-list',
  shares: [
    {
      id: 'app:a-list',
      kind: 'firstPartyApp',
      contractVersion: 1,
      transformVersion: 1,
      categories: [
        {
          id: 'plannedShowings',
          kind: 'event',
          label: 'Planned showings',
          detail: 'The movie, time and theater',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            { label: "The movie's title", sinceVersion: 1 },
            { label: 'The showtime and when it ends', sinceVersion: 1 },
            { label: "The theater's name and time zone", sinceVersion: 1 },
          ],
          scopeVersion: 1,
        },
        {
          id: 'savedTheaters',
          kind: 'place',
          label: 'Saved theaters',
          detail: 'Each theater and its address',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            { label: "Each theater's name", sinceVersion: 1 },
            { label: 'Its address', sinceVersion: 1 },
            { label: 'Its time zone', sinceVersion: 1 },
          ],
          scopeVersion: 1,
        },
        {
          id: 'seenMovies',
          kind: 'knowledge',
          label: 'Movies you have seen',
          detail: 'The title and your rating',
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
          reads: [
            { label: 'The title of each movie you have seen', sinceVersion: 1 },
            { label: 'Your rating', sinceVersion: 1 },
          ],
          scopeVersion: 1,
        },
      ],
      never: ['what you paid', 'savings', 'membership', 'share links'],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
