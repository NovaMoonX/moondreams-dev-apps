// Generated from src/apps/a-list/share/manifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { SourceShares } from '../../../vendor/connectionsContract.js';

export const A_LIST_SHARES: SourceShares = {
  appId: 'a-list',
  shares: [
    {
      id: 'app:a-list',
      kind: 'firstPartyApp',
      contractVersion: 1,
      about:
        "A-List is the person's movie app: films they plan to see in theaters, the showtimes they picked, their theaters and the films they've seen and rated.",
      transformVersion: 1,
      categories: [
        {
          id: 'plannedShowings',
          kind: 'event',
          label: 'Planned showings',
          detail: 'The movie, time and theater',
          meaning:
            'Movies the person has planned to see in a theater, each with the showtime and theater they picked.',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            { label: "The movie's title", sinceVersion: 1, addedOn: null },
            {
              label: 'The showtime and when it ends',
              sinceVersion: 1,
              addedOn: null,
            },
            {
              label: "The theater's name and time zone",
              sinceVersion: 1,
              addedOn: null,
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'savedTheaters',
          kind: 'place',
          label: 'Saved theaters',
          detail: 'Each theater and its address',
          meaning:
            'The theaters the person goes to, saved with their address so they can pick one for a showing.',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            { label: "Each theater's name", sinceVersion: 1, addedOn: null },
            { label: 'Its address', sinceVersion: 1, addedOn: null },
            { label: 'Its time zone', sinceVersion: 1, addedOn: null },
          ],
          scopeVersion: 1,
        },
        {
          id: 'seenMovies',
          kind: 'knowledge',
          label: 'Movies you have seen',
          detail: 'The title and your rating',
          meaning:
            'Movies the person has already watched, with the rating they gave each.',
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
          reads: [
            {
              label: 'The title of each movie you have seen',
              sinceVersion: 1,
              addedOn: null,
            },
            { label: 'Your rating', sinceVersion: 1, addedOn: null },
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
