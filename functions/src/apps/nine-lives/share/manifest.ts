// Generated from src/apps/nine-lives/share/manifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { SourceShares } from '../../../vendor/connectionsContract.js';

export const NINE_LIVES_SHARES: SourceShares = {
  appId: 'nine-lives',
  shares: [
    {
      id: 'app:nine-lives',
      kind: 'firstPartyApp',
      contractVersion: 1,
      transformVersion: 1,
      categories: [
        {
          id: 'cats',
          kind: 'pet',
          label: 'Your cats',
          detail: "Each cat's name",
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
        },
        {
          id: 'vetVisits',
          kind: 'event',
          label: 'Vet visits',
          detail: 'Upcoming visits: the cats, the clinic and the time',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
        },
        {
          id: 'dueCare',
          kind: 'task',
          label: 'Vaccines and preventives due',
          detail: 'What is next due for each cat, and the day',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
        },
        {
          id: 'clinics',
          kind: 'place',
          label: 'Vet clinics',
          detail: 'Name, phone and address',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
        },
        {
          id: 'conditions',
          kind: 'knowledge',
          label: 'Health conditions',
          detail: "Each cat's conditions and whether they are active",
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
        },
      ],
      never: [
        'uploaded records and documents',
        'expenses',
        'weights',
        'litter logs',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
