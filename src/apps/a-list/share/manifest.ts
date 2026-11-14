import type { SourceShares } from '@/lib/connections/contract';

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
          detail: 'The movie, time, theater and whether you have a ticket',
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
            {
              label: 'Whether you have a ticket yet',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 2,
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
          detail: 'The title, the day, your rating and your goals',
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
            {
              label: 'The day you saw it',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
            {
              label:
                'Your weekly and monthly movie goals and how far along you are',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 2,
        },
        {
          id: 'watchlist',
          kind: 'artifact',
          label: 'Your watchlist',
          detail: 'Each movie you want to see, its priority and release date',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 2,
          reads: [
            {
              label: 'Each movie on your watchlist',
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
            { label: 'Its priority', sinceVersion: 1, addedOn: '2026-11-14' },
            {
              label: 'Its release date',
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
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
