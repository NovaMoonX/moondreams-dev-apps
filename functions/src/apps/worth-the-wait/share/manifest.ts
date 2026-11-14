// Generated from src/apps/worth-the-wait/share/manifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { SourceShares } from '../../../vendor/connectionsContract.js';

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
