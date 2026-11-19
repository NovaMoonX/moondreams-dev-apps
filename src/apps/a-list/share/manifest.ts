import type { SourceShares } from '@/lib/connections/contract';

export const A_LIST_SHARES: SourceShares = {
  appId: 'a-list',
  shares: [
    {
      id: 'app:a-list',
      about:
        "A-List is the person's movie app: films they plan to see in theaters, the showtimes they picked, their theaters and the films they've seen and rated.",
      kind: 'firstPartyApp',
      contractVersion: 1,
      transformVersion: 1,
      categories: [
        {
          id: 'plannedShowings',
          kind: 'event',
          label: 'Planned showings',
          meaning:
            'Movies the person has planned to see in a theater, each with the showtime and theater they picked and whether they have a ticket.',
          detail:
            'The movie, time, length and age rating, theater and whether you have a ticket',
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
            {
              label: "The movie's running time and age rating",
              sinceVersion: 3,
              addedOn: '2026-11-14',
            },
            {
              label: "The movie's poster, shown from where it is hosted",
              sinceVersion: 4,
              addedOn: '2026-11-18',
            },
          ],
          scopeVersion: 4,
        },
        {
          id: 'savedTheaters',
          kind: 'place',
          label: 'Saved theaters',
          meaning:
            'The theaters the person goes to, saved with their address so they can pick one for a showing.',
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
          meaning:
            'Movies the person has already watched, with the day, the theater, the star rating they gave if any and their movie-watching goals.',
          detail:
            'The title, the day, the theater, your star rating and your goals',
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
          reads: [
            {
              label: 'The title of each movie you have seen',
              sinceVersion: 1,
              addedOn: null,
            },
            { label: 'Your star rating', sinceVersion: 1, addedOn: null },
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
            {
              label: 'The theater where you saw it',
              sinceVersion: 3,
              addedOn: '2026-11-14',
            },
            {
              label: "The movie's running time and age rating",
              sinceVersion: 3,
              addedOn: '2026-11-14',
            },
            {
              label: "The movie's poster, shown from where it is hosted",
              sinceVersion: 4,
              addedOn: '2026-11-18',
            },
          ],
          scopeVersion: 4,
        },
        {
          id: 'watchlist',
          kind: 'artifact',
          label: 'Your watchlist',
          meaning:
            "Movies the person wants to see but hasn't planned yet, each with how much they want to see it and its release date.",
          detail:
            'Each movie you want to see, its priority, release date, length and age rating',
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
            {
              label: 'Its running time and age rating',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
            {
              label: "The movie's poster, shown from where it is hosted",
              sinceVersion: 3,
              addedOn: '2026-11-18',
            },
          ],
          scopeVersion: 3,
        },
        {
          id: 'savings',
          kind: 'moneySummary',
          label: 'Membership savings',
          meaning:
            "How much the person's movie membership has saved them: what their tickets would have cost, what the membership cost and what is left, for this year and since they joined. Sums only; never what any one ticket cost.",
          detail:
            'Your ticket savings, membership cost and net savings, this year and since you joined',
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 3,
          reads: [
            {
              label:
                'What your tickets saved you, this year and since you joined',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'What the membership has cost and what is left',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
      ],
      never: [
        'what you paid for each ticket',
        'your monthly bill and tax',
        'share links',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
