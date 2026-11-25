// Generated from src/apps/waypoint/share/manifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { SourceShares } from '../../../vendor/connectionsContract.js';

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
            "The plans on the person's trips, such as flights, stays and activities, each with its day, time and place, plus each journey's number and stops, an activity's hours and a rental's return place.",
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
            {
              label: "A flight's airline, flight number and airports",
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
            {
              label:
                "A plan's street address, arrive-by time and opening hours",
              sinceVersion: 3,
              addedOn: '2026-11-14',
            },
            {
              label: "A train's or ferry's operator, number and stops",
              sinceVersion: 3,
              addedOn: '2026-11-14',
            },
            {
              label: "A rental's vehicle and where to return it",
              sinceVersion: 3,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 3,
        },
        {
          id: 'myTasks',
          kind: 'task',
          label: 'Your trip to-dos',
          detail: 'Before the Road tasks assigned to you or private to you',
          meaning:
            "Before the Road is a trip's checklist of things to do before leaving; these are the items still to do that are assigned to the person or private to them, on trips that have not ended.",
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
          id: 'travelers',
          kind: 'person',
          label: 'People you travel with',
          detail: 'The other members of your trips and which trips they are on',
          meaning:
            'The other people on the same trips as the person, by name, with the trips they share.',
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 4,
          reads: [
            {
              label: "Each fellow traveller's name",
              sinceVersion: 1,
              addedOn: '2026-11-18',
            },
            {
              label: 'The trips you share',
              sinceVersion: 1,
              addedOn: '2026-11-18',
            },
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
        {
          id: 'tripChecklist',
          kind: 'artifact',
          label: 'Your trip checklist',
          meaning:
            "Every item on the person's trip checklists, grouped by category, including the ones already done.",
          detail: 'Every to-do by category, done ones included',
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 2,
          reads: [
            {
              label: "The trip's name",
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
            {
              label:
                'Each to-do assigned to you or private to you, grouped by category, done or not',
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'fullChecklist',
          kind: 'task',
          label: 'The whole trip checklist',
          meaning:
            'Your trip checklist read live, and every item rather than only yours: whoever it is for or whether anyone has taken it, with its category, due day, whether it is done and the first names of the travelers it is assigned to.',
          detail:
            'Every item, its category, due day, status and who it is assigned to',
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 3,
          reads: [
            {
              label: 'Every item on the trip checklist, assigned or not',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'The first names of the travelers it is assigned to',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'tripIdeas',
          kind: 'artifact',
          label: 'Trip ideas',
          meaning:
            'Your trip checklist read live, and every item rather than only yours: whoever it is for or whether anyone has taken it, with its category, due day, whether it is done and the first names of the travelers it is assigned to.',
          detail: 'Each idea, a short note and the site its link goes to',
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 3,
          reads: [
            {
              label: "Each idea's title and a short note",
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'The site its link goes to, never the link',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'announcements',
          kind: 'artifact',
          label: 'Trip announcements',
          meaning:
            "What trip admins announced to the travelers on the person's trips, each with its trip, a short text and the day it was posted. A text with a link, an email or a phone number is left out.",
          detail: 'Each announcement, its trip and when it was posted',
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 3,
          reads: [
            {
              label: "The announcement's title and a short text",
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'The trip and the day it was posted',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
      ],
      never: [
        "other members' private to-dos",
        'contact details',
        'timeline suggestions',
        'expense lines',
        'booking confirmation codes',
        'receipts',
        'the album',
      ],
      actions: [],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
