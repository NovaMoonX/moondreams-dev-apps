import type { ConnectorManifest } from '@/lib/connections/contract';

export const GOOGLE_DRIVE_MANIFEST: ConnectorManifest = {
  id: 'google:drive',
  kind: 'oauth',
  contractVersion: 1,
  about:
    "Google Drive, the person's Google documents and PDFs, connected through their Google account.",
  transformVersion: 1,
  categories: [
    {
      id: 'documents',
      kind: 'knowledge',
      label: 'Documents',
      detail:
        'Docs and PDFs, searched when you ask. Only what an answer quotes is kept.',
      meaning:
        "Docs and PDFs in the person's Google Drive that match a search, with passages from the matching files.",
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
