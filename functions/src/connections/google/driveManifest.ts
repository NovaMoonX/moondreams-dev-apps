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
        'Google Docs and PDFs, searched when you ask. Only what an answer quotes is kept.',
      mode: 'live',
      isOnAtConnect: true,
      addedInVersion: 1,
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
