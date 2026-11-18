import type { SourceShares } from '@/lib/connections/contract';

export const WORTH_THE_WAIT_SHARES: SourceShares = {
  appId: 'worth-the-wait',
  shares: [
    {
      id: 'app:worth-the-wait',
      kind: 'firstPartyApp',
      contractVersion: 1,
      about:
        'Worth the Wait is a private space two people share for thoughts, hopes and questions they are saving to explore together when both are ready.',
      transformVersion: 1,
      categories: [
        {
          id: 'boxCounts',
          kind: 'countSummary',
          label: 'Box counts',
          detail:
            "Each box's name, how many things are in it and how many are revealed",
          meaning:
            "A box holds the thoughts and wishes the two people keep hidden from each other until both agree to reveal it; this is each box's name, how many things it holds and how many are revealed or still waiting.",
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
          reads: [
            {
              label: "Each box's name and emoji",
              sinceVersion: 1,
              addedOn: null,
            },
            {
              label: 'How many things are in it',
              sinceVersion: 1,
              addedOn: null,
            },
            {
              label: 'How many are revealed and how many are waiting',
              sinceVersion: 1,
              addedOn: null,
            },
            {
              label: "Each box's description",
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
            {
              label: 'Whether a reveal is waiting on you',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 2,
        },
      ],
      never: [
        'anything an item says',
        'who added an item',
        'when an item was added or revealed',
        'the invite code',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
