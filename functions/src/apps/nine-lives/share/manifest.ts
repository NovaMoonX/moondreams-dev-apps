// Generated from src/apps/nine-lives/share/manifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { SourceShares } from '../../../vendor/connectionsContract.js';

export const NINE_LIVES_SHARES: SourceShares = {
  appId: 'nine-lives',
  shares: [
    {
      id: 'app:nine-lives',
      about:
        "Nine Lives is the person's cat care app: their cats, vet visits and clinics, vaccines and preventives, and each cat's health conditions.",
      kind: 'firstPartyApp',
      contractVersion: 1,
      transformVersion: 1,
      categories: [
        {
          id: 'cats',
          kind: 'pet',
          label: 'Your cats',
          meaning:
            "The cats in the person's household, with each one's birth date, breed and food.",
          detail: "Each cat's name, birth date, breed and food",
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            { label: "Each cat's name", sinceVersion: 1, addedOn: null },
            {
              label: "Each cat's birth date, breed and food",
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
          meaning:
            "The person's cats' vet appointments, upcoming and past, with the clinic, the time and the reason.",
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
          meaning:
            "The next vaccine or preventive each of the person's cats is due for, and the day it is due.",
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
          meaning:
            'The vet clinics the person uses, with their phone number, address and doctors.',
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
          meaning:
            'Health problems the person tracks for each cat, and whether each is active, ongoing or resolved.',
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
