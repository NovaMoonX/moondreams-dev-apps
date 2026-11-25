// Generated from src/apps/worth-the-wait/share/manifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { SourceShares } from '../../../vendor/connectionsContract.js';

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
        {
          id: 'revealedItems',
          kind: 'knowledge',
          label: 'Revealed items',
          detail:
            'The things already revealed: what each says, its box and when',
          meaning:
            'The thoughts and wishes the two people have already revealed to each other, each with its box and the day it was revealed; what is still hidden is never read.',
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 3,
          reads: [
            {
              label: 'What each revealed item says',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'Which box it is in',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'When it was revealed',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
      ],
      never: [
        'anything an item that is still hidden says',
        'who added an item',
        'when an item was added',
        'the invite code',
      ],
      actions: [],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
