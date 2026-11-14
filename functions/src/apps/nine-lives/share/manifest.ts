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
          detail: "Each cat's name, age, breed and food",
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            { label: "Each cat's name", sinceVersion: 1, addedOn: null },
            {
              label: 'Its birth date, breed and food',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 2,
        },
        {
          id: 'vetVisits',
          kind: 'event',
          label: 'Vet visits',
          detail: 'Upcoming and past visits: the cats, the clinic and the time',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            {
              label: 'The cats going and the reason for the visit',
              sinceVersion: 1,
              addedOn: null,
            },
            { label: "The clinic's name", sinceVersion: 1, addedOn: null },
            { label: 'The date and time', sinceVersion: 1, addedOn: null },
            {
              label: 'Visits from the past year',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
            {
              label: "The doctor's name",
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 2,
          historyDays: 365,
        },
        {
          id: 'dueCare',
          kind: 'task',
          label: 'Vaccines and preventives due',
          detail:
            'What is next due for each cat, the day and when it was last given',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            {
              label: 'The cats and the vaccine or preventive due',
              sinceVersion: 1,
              addedOn: null,
            },
            { label: 'The day it is due', sinceVersion: 1, addedOn: null },
            {
              label: 'When the last dose was given',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 2,
        },
        {
          id: 'clinics',
          kind: 'place',
          label: 'Vet clinics',
          detail: 'Name, phone, address and doctors',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            { label: "Each clinic's name", sinceVersion: 1, addedOn: null },
            {
              label: 'Its phone number and address',
              sinceVersion: 1,
              addedOn: null,
            },
            {
              label: 'Its doctors',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 2,
        },
        {
          id: 'conditions',
          kind: 'knowledge',
          label: 'Health conditions',
          detail: "Each cat's conditions and whether they are active",
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
          reads: [
            {
              label: "Each condition's name and the cat it is for",
              sinceVersion: 1,
              addedOn: null,
            },
            {
              label: 'Whether it is active, ongoing or resolved',
              sinceVersion: 1,
              addedOn: null,
            },
          ],
          scopeVersion: 1,
        },
      ],
      never: [
        'uploaded records and documents',
        'expenses and vet costs',
        'microchip and insurance details',
        'weights',
        'litter logs',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
