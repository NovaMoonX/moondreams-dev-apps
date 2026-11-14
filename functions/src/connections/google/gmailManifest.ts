// Generated from src/lib/connections/google/gmailManifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { ConnectorManifest } from '../../vendor/connectionsContract.js';

export const GOOGLE_GMAIL_MANIFEST: ConnectorManifest = {
  id: 'google:gmail',
  kind: 'oauth',
  contractVersion: 1,
  transformVersion: 1,
  categories: [
    {
      id: 'mail',
      kind: 'knowledge',
      label: 'Mail',
      detail: 'Searched when you ask. Only what an answer quotes is kept.',
      mode: 'live',
      isOnAtConnect: true,
      addedInVersion: 1,
      reads: [
        {
          label: 'The subject and sender of messages that match a search',
          sinceVersion: 1,
        },
        { label: 'A short snippet of each', sinceVersion: 1 },
      ],
      scopeVersion: 1,
    },
  ],
  never: ['Attachments', 'Sending, labelling, archiving or deleting'],
  capabilities: { read: true, write: false, backgroundSync: false },
  connect: {
    kind: 'oauth',
    provider: 'google',
    scopesByCategory: {
      mail: ['https://www.googleapis.com/auth/gmail.readonly'],
    },
    isRestricted: true,
  },
};
