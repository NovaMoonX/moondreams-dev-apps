import type { ConnectorManifest } from '@/lib/connections/contract';

export const GOOGLE_CALENDAR_MANIFEST: ConnectorManifest = {
  id: 'google:calendar',
  kind: 'oauth',
  contractVersion: 1,
  transformVersion: 1,
  categories: [
    {
      id: 'events',
      kind: 'event',
      label: 'Events',
      detail: "Each event's title, time and calendar.",
      mode: 'sync',
      isOnAtConnect: true,
      addedInVersion: 1,
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
