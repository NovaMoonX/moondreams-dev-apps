import type { SourceShares } from '@/lib/connections/contract';

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
          reads: [{ label: "Each cat's name", sinceVersion: 1 }],
          scopeVersion: 1,
        },
        {
          id: 'vetVisits',
          kind: 'event',
          label: 'Vet visits',
          detail: 'Upcoming visits: the cats, the clinic and the time',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            {
              label: 'The cats going and the reason for the visit',
              sinceVersion: 1,
            },
            { label: "The clinic's name", sinceVersion: 1 },
            { label: 'The date and time', sinceVersion: 1 },
          ],
          scopeVersion: 1,
        },
        {
          id: 'dueCare',
          kind: 'task',
          label: 'Vaccines and preventives due',
          detail: 'What is next due for each cat, and the day',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            {
              label: 'The cats and the vaccine or preventive due',
              sinceVersion: 1,
            },
            { label: 'The day it is due', sinceVersion: 1 },
          ],
          scopeVersion: 1,
        },
        {
          id: 'clinics',
          kind: 'place',
          label: 'Vet clinics',
          detail: 'Name, phone and address',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            { label: "Each clinic's name", sinceVersion: 1 },
            { label: 'Its phone number and address', sinceVersion: 1 },
          ],
          scopeVersion: 1,
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
            },
            {
              label: 'Whether it is active, ongoing or resolved',
              sinceVersion: 1,
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
