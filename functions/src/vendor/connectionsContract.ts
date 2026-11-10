// Generated from src/lib/connections/contract.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
/** The read contract between apps on this site: what a source offers, what a grant allows, and the shape every shared record takes. Free of imports so the server keeps an exact copy. */

export const CONTRACT_VERSION = 1;

/** The account a site app's grant is held under; outside services key theirs by provider. */
export const SITE_ACCOUNT_ID = 'site';

export type ConnectorId =
  | `app:${string}`
  | 'google:calendar'
  | 'google:gmail'
  | 'google:drive'
  | 'google:contacts';

export type SharedKind =
  | 'person'
  | 'place'
  | 'event'
  | 'task'
  | 'project'
  | 'knowledge'
  | 'artifact'
  | 'scenario'
  | 'trip'
  | 'pet'
  | 'moneySummary'
  | 'transaction'
  | 'countSummary';

export interface CategoryManifest {
  id: string;
  kind: SharedKind;
  /** The person's words, as the source names it. */
  label: string;
  /** What it holds, in one line. */
  detail: string;
  mode: 'sync' | 'live';
  isOnAtConnect: boolean;
  /** A category added after people connected starts off and shows as new once. */
  addedInVersion: number;
}

export interface ConnectorManifest {
  id: ConnectorId;
  kind: 'firstPartyApp' | 'oauth' | 'apiKey';
  contractVersion: typeof CONTRACT_VERSION;
  /** Bumped whenever the adapter's output shape changes. */
  transformVersion: number;
  categories: CategoryManifest[];
  /** The person's words for what is never shared; such data has no category and no field. */
  never: string[];
  capabilities: { read: true; write: false; backgroundSync: boolean };
  connect:
    | { kind: 'siteGrant' }
    | {
        kind: 'oauth';
        provider: 'google';
        scopesByCategory: Record<string, string[]>;
        isRestricted: boolean;
      };
}

/** A site app's sharing declaration: its manifest, or `shares: []` for an app no other app may read. */
export type SourceShares =
  | { appId: string; shares: [] }
  | { appId: string; shares: [ConnectorManifest] };

export type ExtraValue = string | number | boolean | null;

export interface SharedRecord {
  sourceRef: string;
  kind: SharedKind;
  title: string;
  subtitle: string | null;
  detail: string | null;
  startAt: number | null;
  endAt: number | null;
  isAllDay: boolean;
  dueAt: number | null;
  timeZone: string | null;
  placeLabel: string | null;
  amountCents: number | null;
  currency: string | null;
  sourceUpdatedAt: number | null;
  /** Only the keys `EXTRA_KEYS` allows for the record's kind. */
  extra: Record<string, ExtraValue>;
}

/** Every key a shared record may carry; a source can't add one. */
export const SHARED_RECORD_KEYS: (keyof SharedRecord)[] = [
  'sourceRef',
  'kind',
  'title',
  'subtitle',
  'detail',
  'startAt',
  'endAt',
  'isAllDay',
  'dueAt',
  'timeZone',
  'placeLabel',
  'amountCents',
  'currency',
  'sourceUpdatedAt',
  'extra',
];

export const EXTRA_KEYS: Record<SharedKind, string[]> = {
  person: [],
  place: ['phone', 'address'],
  event: [],
  task: [],
  project: ['available', 'pending', 'sold'],
  knowledge: ['rating'],
  artifact: [],
  scenario: [],
  trip: [],
  pet: [],
  moneySummary: ['nextIncomeAt', 'dueBeforeIncomeCents'],
  transaction: ['category'],
  countSummary: ['items', 'revealed', 'notYetRevealed'],
};

export type GrantStatus = 'live' | 'needsReconnect' | 'noAccess' | 'ended';

export interface GrantCategory {
  isOn: boolean;
  changedAt: number;
}

export interface CategoryState {
  lastOkAt: number | null;
  lastError: { code: string; at: number } | null;
  count: number;
}

export interface ConnectionGrant {
  readerAppId: string;
  connectorId: ConnectorId;
  accountId: string;
  categories: Record<string, GrantCategory>;
  options: { calendarIds: string[] } | null;
  status: GrantStatus;
  categoryState: Record<string, CategoryState>;
  /** Newest first, at most `MAX_GRANT_ERRORS`. */
  errors: { category: string; code: string; at: number }[];
  newCategoryIds: string[];
  lastSyncAt: number | null;
  syncLeaseUntil: number | null;
  keptCopies: { count: number; deleteAfter: number | null } | null;
  createdAt: number;
  updatedAt: number;
  endedAt: number | null;
}

export const MAX_GRANT_ERRORS = 10;

export const toGrantId = (
  readerAppId: string,
  connectorId: ConnectorId,
  accountId: string,
) => `${readerAppId}__${connectorId}__${accountId}`;

export const toAppConnectorId = (appId: string): ConnectorId => `app:${appId}`;

/** The app a site connector stands for, or null for an outside service. */
export const readConnectorAppId = (connectorId: string): string | null =>
  connectorId.startsWith('app:') ? connectorId.slice(4) : null;

export interface GrantConnectionRequest {
  readerAppId: string;
  connectorId: ConnectorId;
  accountId: string;
  categoryIds: string[];
}

export interface UpdateConnectionRequest {
  grantId: string;
  categories: Record<string, boolean>;
}

export interface EndConnectionRequest {
  grantId: string;
  deleteCopies: boolean;
}
