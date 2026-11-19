import type { SourceShares } from '@/lib/connections/contract';

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
            "The cats in the person's household, with each one's photo, birth date, breed and food.",
          detail: "Each cat's name, photo, birth date, breed and food",
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
            {
              label: "A small private copy of each cat's photo",
              sinceVersion: 3,
              addedOn: '2026-11-18',
            },
          ],
          scopeVersion: 3,
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
            'The vet clinics the person uses, with their phone number, address, doctors and whether one is open 24 hours for emergencies.',
          detail: 'Name, phone, address, doctors and 24-hour emergency care',
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
            {
              label: 'Whether it is open 24 hours for emergencies',
              sinceVersion: 3,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 3,
        },
        {
          id: 'vets',
          kind: 'person',
          label: 'Veterinarians',
          meaning:
            'The veterinarians at the vet clinics the person uses, each with the clinic they work at.',
          detail: "Each vet's name and the clinic they work at",
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 4,
          reads: [
            {
              label: "Each veterinarian's name",
              sinceVersion: 1,
              addedOn: '2026-11-18',
            },
            {
              label: 'The clinic they work at',
              sinceVersion: 1,
              addedOn: '2026-11-18',
            },
          ],
          scopeVersion: 1,
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
        {
          id: 'symptoms',
          kind: 'knowledge',
          label: 'Symptoms',
          meaning:
            'Symptoms the person noted for each cat in the past six months, with when each was first noticed and how severe it was.',
          detail:
            "Each cat's symptoms from the past six months: what was noticed, when and how severe",
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 2,
          reads: [
            {
              label:
                "Each symptom's description, quick tags and the cat it is for",
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
            {
              label: 'When it was first noticed and how severe it was',
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
            {
              label: 'Symptoms first noticed in the past six months',
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 1,
          historyDays: 180,
        },
        {
          id: 'visitNotes',
          kind: 'event',
          label: 'Vet visit notes',
          meaning:
            "What the person wrote down after each of their cats' past vet visits, with the reason for the visit; read only when asked.",
          detail: "Each past visit's cats, reason, clinic, date and notes",
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 3,
          reads: [
            {
              label:
                'The cats, the reason, the clinic and the date of each past visit',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'The notes written after the visit',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'doseHistory',
          kind: 'event',
          label: 'Vaccines and preventives given',
          meaning:
            'Every dose of a vaccine or preventive the person gave their cats, with the day and the dose they wrote down; read only when asked.',
          detail:
            'Each dose given: the cat, the product, the day and the dosage',
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 3,
          reads: [
            {
              label:
                'The cat, the vaccine or preventive and the day of each dose',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: "A preventive's dosage",
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'weights',
          kind: 'knowledge',
          label: 'Weights',
          meaning:
            'Each time the person weighed one of their cats, with the weight and the day; read only when asked.',
          detail: "Each cat's weigh-ins: the weight and the day",
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 3,
          reads: [
            {
              label: "Each cat's weight, in the unit the person used",
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'The day it was weighed',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'catExpenses',
          kind: 'artifact',
          label: 'Cat spending',
          meaning:
            'What the person spent on each cat in each month, in dollars, as one total per cat per month (an expense shared by several cats is split evenly, and a recurring charge counts once, on the day it began); read only when asked.',
          detail:
            "Each cat's spending by month: the total and how many expenses",
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 3,
          reads: [
            {
              label: "Each cat's total spending for a month",
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'How many expenses made up the total',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
      ],
      never: [
        'uploaded records and documents',
        'expense notes, line items and receipts',
        'microchip and insurance details',
        'litter logs',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
