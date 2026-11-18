// Generated from src/lib/connections/google/calendarManifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { ConnectorManifest } from '../../vendor/connectionsContract.js';

export const GOOGLE_CALENDAR_MANIFEST: ConnectorManifest = {
  id: 'google:calendar',
  kind: 'oauth',
  contractVersion: 1,
  about:
    "Google Calendar, the person's Google calendars, connected through their Google account.",
  transformVersion: 1,
  categories: [
    {
      id: 'events',
      kind: 'event',
      label: 'Events',
      detail: "Each event's title, time and calendar.",
      meaning:
        "Events on the person's Google calendars, with their time, calendar, and whether the person is free or busy.",
      mode: 'sync',
      isOnAtConnect: true,
      addedInVersion: 1,
      reads: [
        { label: "Each event's title", sinceVersion: 1, addedOn: null },
        { label: 'Its start and end', sinceVersion: 1, addedOn: null },
        {
          label: 'Which of your calendars it is on',
          sinceVersion: 1,
          addedOn: null,
        },
        {
          label: 'Whether you are free or busy',
          sinceVersion: 1,
          addedOn: null,
        },
      ],
      scopeVersion: 1,
    },
  ],
  never: ['Descriptions', 'guests', 'places', 'video links', 'attachments'],
  capabilities: { read: true, write: false, backgroundSync: true },
  connect: {
    kind: 'oauth',
    provider: 'google',
    scopesByCategory: {
      events: ['https://www.googleapis.com/auth/calendar.readonly'],
    },
    isRestricted: false,
  },
};
