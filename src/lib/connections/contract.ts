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
  /** Each detail the category reads, in the person's words, the `scopeVersion` it arrived in, and the day it shipped (`YYYY-MM-DD`, null for what it read from the start); a read shows as New for a while after that day until the person sees it. */
  reads: { label: string; sinceVersion: number; addedOn: string | null }[];
  /** Starts at 1; bumped whenever `reads` gains an entry. */
  scopeVersion: number;
  /** How many days back a sync reads and keeps what has ended, when longer than the usual window, for records whose past is the point. */
  historyDays?: number;
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
  /** An all-day record's last day (UTC midnight), never the day after it. */
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
  event: ['calendarId', 'isTentative', 'isFree', 'sameEventKey', 'hasTicket'],
  task: [],
  project: [
    'available',
    'pending',
    'sold',
    'newInquiries',
    'collectedCents',
    'leftCents',
  ],
  knowledge: ['rating'],
  artifact: ['status'],
  scenario: [],
  trip: [],
  pet: [],
  moneySummary: ['nextIncomeAt', 'dueBeforeIncomeCents'],
  transaction: ['category'],
  countSummary: ['items', 'revealed', 'notYetRevealed', 'revealsWaiting'],
};

export type GrantStatus = 'live' | 'needsReconnect' | 'noAccess' | 'ended';

export interface GrantCategory {
  isOn: boolean;
  changedAt: number;
  /** The category's `scopeVersion` the person last saw (granting counts); null reads as 1. */
  seenScopeVersion: number | null;
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

/** The most records a source hands over, and a reader keeps, for one category. */
export const MAX_RECORDS_PER_CATEGORY = 1000;

export const toGrantId = (
  readerAppId: string,
  connectorId: ConnectorId,
  accountId: string,
) => `${readerAppId}__${connectorId}__${accountId}`;

export const toAppConnectorId = (appId: string): ConnectorId => `app:${appId}`;

/** The app a site connector stands for, or null for an outside service. */
export const readConnectorAppId = (connectorId: string): string | null =>
  connectorId.startsWith('app:') ? connectorId.slice(4) : null;

export interface GrantOptions {
  calendarIds: string[];
}

export interface GrantConnectionRequest {
  readerAppId: string;
  connectorId: ConnectorId;
  accountId: string;
  categoryIds: string[];
  options: GrantOptions | null;
}

/** Each part is left as it is when absent. */
export interface UpdateConnectionRequest {
  grantId: string;
  categories?: Record<string, boolean>;
  options?: GrantOptions;
  /** The account's short name ("work"); null clears it. */
  accountLabel?: string | null;
  /** Category id to the `scopeVersion` the person has now seen. */
  seenScopes?: Record<string, number>;
}

/** Outside accounts are keyed by provider: `g_` and 16 hex of a hash of Google's account id. */
export const GOOGLE_ACCOUNT_PREFIX = 'g_';

export const isOutsideAccount = (accountId: string) =>
  accountId.startsWith(GOOGLE_ACCOUNT_PREFIX);

export type AccountStatus = 'live' | 'needsReconnect' | 'revoked';

/** `connections/{uid}/accounts/{accountId}`: the owner reads, only callables write. Site apps have none. */
export interface ConnectionAccount {
  provider: 'google';
  email: string;
  label: string | null;
  grantedScopes: string[];
  status: AccountStatus;
  connectedAt: number;
  lastError: { code: string; at: number } | null;
}

export const MAX_ACCOUNT_LABEL_LENGTH = 24;

export interface StartGoogleConnectionRequest {
  readerAppId: string;
  connectorId: ConnectorId;
  /** Where Google sends the person back: this site's origin and the reader's own path. */
  redirectUri: string;
  /** Reconnecting a known account: its id, so Google preselects it. */
  accountId: string | null;
  /** Adding another account: Google asks which one. */
  isAnotherAccount: boolean;
}

export interface StartGoogleConnectionResult {
  authUrl: string;
  state: string;
}

export interface FinishGoogleConnectionRequest {
  code: string;
  state: string;
}

export interface FinishGoogleConnectionResult {
  accountId: string;
  email: string;
  readerAppId: string;
  connectorId: ConnectorId;
  /** True when this account already had a live grant for the connector (a reconnect). */
  hasLiveGrant: boolean;
}

export interface ReadConnectorOptionsRequest {
  connectorId: ConnectorId;
  accountId: string;
}

/** One choice (a calendar, a contact) a connector offers, read live from the provider. */
export interface ConnectorOption {
  id: string;
  name: string;
  colour: string | null;
  /** One line that tells two choices of the same name apart (an email or a phone). */
  detail: string | null;
  /** An https picture from a provider host the server allows, or null. */
  photoUrl: string | null;
  isPrimary: boolean;
  /** Holidays, subscriptions and calendars only shared to read start off. */
  isOnByDefault: boolean;
}

export interface EndConnectionRequest {
  grantId: string;
  deleteCopies: boolean;
}
