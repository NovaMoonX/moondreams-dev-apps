import type { SourceShares } from '@/lib/connections/contract';

export const WORTH_THE_WAIT_SHARES: SourceShares = {
  appId: 'worth-the-wait',
  shares: [
    {
      id: 'app:worth-the-wait',
      kind: 'firstPartyApp',
      contractVersion: 1,
      transformVersion: 1,
      categories: [
        {
          id: 'boxCounts',
          kind: 'countSummary',
          label: 'Box counts',
          detail:
            "Each box's name, how many things are in it and how many are revealed",
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
          reads: [
            { label: "Each box's name and emoji", sinceVersion: 1 },
            { label: 'How many things are in it', sinceVersion: 1 },
            {
              label: 'How many are revealed and how many are waiting',
              sinceVersion: 1,
            },
          ],
          scopeVersion: 1,
        },
      ],
      never: [
        'anything an item says',
        'who added an item',
        'when anything was added or revealed',
        'the invite code',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
