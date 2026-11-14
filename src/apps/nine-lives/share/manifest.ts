import type { SourceShares } from '@/lib/connections/contract';

export const NINE_LIVES_SHARES: SourceShares = {
  appId: 'nine-lives',
  shares: [
    {
      id: 'app:nine-lives',
      kind: 'firstPartyApp',
      contractVersion: 1,
      about:
        "Nine Lives is the person's cat care app: their cats, vet visits and clinics, vaccines and preventives, and each cat's health conditions.",
      transformVersion: 1,
      categories: [
        {
          id: 'cats',
          kind: 'pet',
          label: 'Your cats',
          detail: "Each cat's name",
          meaning: "The cats in the person's household.",
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [{ label: "Each cat's name", sinceVersion: 1, addedOn: null }],
          scopeVersion: 1,
        },
        {
          id: 'vetVisits',
          kind: 'event',
          label: 'Vet visits',
          detail: 'Upcoming visits: the cats, the clinic and the time',
          meaning:
            "Upcoming vet appointments for the person's cats, with the clinic, the time and the reason.",
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
          ],
          scopeVersion: 1,
        },
        {
          id: 'dueCare',
          kind: 'task',
          label: 'Vaccines and preventives due',
          detail: 'What is next due for each cat, and the day',
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
          ],
          scopeVersion: 1,
        },
        {
          id: 'clinics',
          kind: 'place',
          label: 'Vet clinics',
          detail: 'Name, phone and address',
          meaning:
            'The vet clinics the person uses, with their phone number and address.',
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
          ],
          scopeVersion: 1,
        },
        {
          id: 'conditions',
          kind: 'knowledge',
          label: 'Health conditions',
          detail: "Each cat's conditions and whether they are active",
          meaning:
            'Health problems the person tracks for each cat, and whether each is active, ongoing or resolved.',
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
        'expenses',
        'weights',
        'litter logs',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
