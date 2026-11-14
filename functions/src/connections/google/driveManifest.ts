// Generated from src/lib/connections/google/driveManifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { ConnectorManifest } from '../../vendor/connectionsContract.js';

export const GOOGLE_DRIVE_MANIFEST: ConnectorManifest = {
  id: 'google:drive',
  kind: 'oauth',
  contractVersion: 1,
  transformVersion: 1,
  categories: [
    {
      id: 'documents',
      kind: 'knowledge',
      label: 'Documents',
      detail:
        'Docs and PDFs, searched when you ask. Only what an answer quotes is kept.',
      mode: 'live',
      isOnAtConnect: true,
      addedInVersion: 1,
      reads: [
        {
          label: 'The name of each Doc or PDF that matches a search',
          sinceVersion: 1,
          addedOn: null,
        },
        {
          label: 'Passages from the files that match',
          sinceVersion: 1,
          addedOn: null,
        },
      ],
      scopeVersion: 1,
    },
  ],
  never: [
    'Sheets, slides, images and other files',
    'Creating, changing, sharing or deleting files',
  ],
  capabilities: { read: true, write: false, backgroundSync: false },
  connect: {
    kind: 'oauth',
    provider: 'google',
    scopesByCategory: {
      documents: ['https://www.googleapis.com/auth/drive.readonly'],
    },
    isRestricted: true,
  },
};
