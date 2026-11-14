import type { ConnectorManifest } from '@/lib/connections/contract';

export const GOOGLE_CONTACTS_MANIFEST: ConnectorManifest = {
  id: 'google:contacts',
  kind: 'oauth',
  contractVersion: 1,
  transformVersion: 1,
  categories: [
    {
      id: 'contacts',
      kind: 'person',
      label: 'Contacts',
      detail:
        'Listed when you choose who to bring in. Only the people you tick are copied.',
      mode: 'live',
      isOnAtConnect: true,
      addedInVersion: 1,
      reads: [
        { label: "Each contact's name", sinceVersion: 1 },
        { label: 'Their emails and phone numbers', sinceVersion: 1 },
        { label: 'Their photo and birthday', sinceVersion: 1 },
      ],
      scopeVersion: 1,
    },
  ],
  never: [
    'Contact groups, notes and any field beyond name, email, phone and photo',
    'Creating, changing or deleting contacts',
  ],
  capabilities: { read: true, write: false, backgroundSync: false },
  connect: {
    kind: 'oauth',
    provider: 'google',
    scopesByCategory: {
      contacts: ['https://www.googleapis.com/auth/contacts.readonly'],
    },
    isRestricted: false,
  },
};
