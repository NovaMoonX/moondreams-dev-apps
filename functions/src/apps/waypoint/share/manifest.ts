// Generated from src/apps/waypoint/share/manifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { SourceShares } from '../../../vendor/connectionsContract.js';

export const WAYPOINT_SHARES: SourceShares = {
  appId: 'waypoint',
  shares: [
    {
      id: 'app:waypoint',
      kind: 'firstPartyApp',
      contractVersion: 1,
      transformVersion: 1,
      categories: [
        {
          id: 'trips',
          kind: 'trip',
          label: 'Your trips',
          detail: 'Name, dates and where',
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
          ],
          scopeVersion: 2,
        },
        {
          id: 'myTasks',
          kind: 'task',
          label: 'Your trip to-dos',
          detail: 'Before the Road tasks assigned to you or private to you',
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
          kind: 'countSummary',
          label: 'Your trip checklist',
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
      ],
      never: [
        "other members' private to-dos",
        'contact details',
        'suggestions',
        'expense lines',
        'booking confirmation codes',
        'receipts',
        'the album',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
