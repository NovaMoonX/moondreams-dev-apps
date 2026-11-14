import type { SourceShares } from '@/lib/connections/contract';

export const WAYPOINT_SHARES: SourceShares = {
  appId: 'waypoint',
  shares: [
    {
      id: 'app:waypoint',
      kind: 'firstPartyApp',
      contractVersion: 1,
      about:
        "Waypoint is the person's group travel planner: trips with a day-by-day itinerary, a Before the Road checklist and shared expenses split between travelers.",
      transformVersion: 1,
      categories: [
        {
          id: 'trips',
          kind: 'trip',
          label: 'Your trips',
          detail: 'Name, dates and where',
          meaning:
            'The trips the person is part of, with their dates and the city.',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            { label: "Each trip's name", sinceVersion: 1, addedOn: null },
            {
              label: 'Its dates and time zone',
              sinceVersion: 1,
              addedOn: null,
            },
            { label: 'The city', sinceVersion: 1, addedOn: null },
          ],
          scopeVersion: 1,
        },
        {
          id: 'itinerary',
          kind: 'event',
          label: 'Trip plans',
          detail:
            'Activities, flights, drives, stays and rentals, at their local times',
          meaning:
            "The plans on the person's trips, such as flights, stays and activities, each with its day, time and place.",
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            {
              label:
                'Each plan, flight, drive, stay and rental you are part of',
              sinceVersion: 1,
              addedOn: null,
            },
            {
              label: 'Its times and time zone',
              sinceVersion: 1,
              addedOn: null,
            },
            {
              label: 'Its place name or street address',
              sinceVersion: 1,
              addedOn: null,
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'myTasks',
          kind: 'task',
          label: 'Your trip to-dos',
          detail: 'Before the Road tasks assigned to you or private to you',
          meaning:
            "Before the Road is a trip's checklist of things to do before leaving; these are the items assigned to the person or private to them.",
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            {
              label:
                'Each Before the Road task assigned to you or private to you',
              sinceVersion: 1,
              addedOn: null,
            },
            { label: 'The trip it belongs to', sinceVersion: 1, addedOn: null },
            { label: 'The day it is due', sinceVersion: 1, addedOn: null },
          ],
          scopeVersion: 1,
        },
        {
          id: 'tripBalances',
          kind: 'moneySummary',
          label: 'What you owe and are owed',
          detail: 'One line per trip: what you owe and what you are owed',
          meaning:
            "For each trip, the shared expenses' result: how much the person owes the group and how much they are owed.",
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
          reads: [
            { label: "The trip's name", sinceVersion: 1, addedOn: null },
            {
              label: 'What you owe and what you are owed',
              sinceVersion: 1,
              addedOn: null,
            },
          ],
          scopeVersion: 1,
        },
      ],
      never: [
        "other members' private to-dos",
        'contact details',
        'suggestions',
        'expense lines',
        'receipts',
        'the album',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
