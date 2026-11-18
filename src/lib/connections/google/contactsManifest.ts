import type { ConnectorManifest } from '@/lib/connections/contract';

export const GOOGLE_CONTACTS_MANIFEST: ConnectorManifest = {
  id: 'google:contacts',
  kind: 'oauth',
  contractVersion: 1,
  about:
    "Google Contacts, the people saved in the person's Google account, connected through their Google account.",
  transformVersion: 1,
  categories: [
    {
      id: 'contacts',
      kind: 'person',
      label: 'Contacts',
      detail:
        'Listed when you choose who to bring in. Only the people you tick are copied.',
      meaning:
        "The people in the person's Google Contacts, with their emails, phone numbers, photo and birthday.",
      mode: 'live',
      isOnAtConnect: true,
      addedInVersion: 1,
      reads: [
        { label: "Each contact's name", sinceVersion: 1, addedOn: null },
        {
          label: 'Their emails and phone numbers',
          sinceVersion: 1,
          addedOn: null,
        },
        { label: 'Their photo and birthday', sinceVersion: 1, addedOn: null },
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
