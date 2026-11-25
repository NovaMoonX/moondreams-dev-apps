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
  /** What this category is in the person's life, in one sentence for an assistant that has never seen the app, using the app's own words for it; never shown in the app. */
  meaning: string;
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

/** One thing a source app does for an assistant on request, drawing only on categories the person switched on. */
export interface AppActionManifest {
  /** Snake verb_noun. */
  id: string;
  kind: 'read' | 'change';
  /** A read's share categories: it is usable while any is on, and its result says which ones held something back. */
  categories: string[];
  /** A change's permission id; null for a read. */
  permission: string | null;
  /** The person's words for it. */
  label: string;
  /** The id of the `tools` entry it is offered under: actions sharing a tool are its options, picked by the tool's `action` field. */
  tool: string;
  /** True for a change that can alter or replace what the person already has (an edit), false for one that only adds, and for a read. */
  changesExisting: boolean;
}

/** One tool a source app offers an assistant, grouping actions of one kind whose fields agree, so an app stays a handful of tools however many actions it has. */
export interface AssistantToolManifest {
  /** Snake case; the tool is named `{appId}_{id}`. */
  id: string;
  /** A short title in the person's words, shown by assistants that list tools. */
  title: string;
}

/** A kind of change a source app lets an assistant make, each its own switch on the connection, off until the person turns it on. */
export interface ChangePermissionManifest {
  id: string;
  /** The switch's label, in the person's words. */
  label: string;
  /** One sentence on what turning it on lets an assistant do, and what it never does. */
  meaning: string;
}

export interface ConnectorManifest {
  id: ConnectorId;
  kind: 'firstPartyApp' | 'oauth' | 'apiKey';
  /** What the source is, in one or two sentences for an assistant that has never seen it; never shown in the app. */
  about: string;
  contractVersion: typeof CONTRACT_VERSION;
  /** Bumped whenever the adapter's output shape changes. */
  transformVersion: number;
  categories: CategoryManifest[];
  /** The person's words for what is never shared; such data has no category and no field. */
  never: string[];
  /** What the app offers an assistant beyond its records; `[]` for a source with none. */
  actions: AppActionManifest[];
  /** The tools its actions are offered under; `[]` for a source with no actions. */
  tools: AssistantToolManifest[];
  /** The person's everyday words for what this source holds, which open each of its tools; `[]` for a source with no actions. */
  askedAbout: string[];
  /** The kinds of change an assistant may be allowed to make; `[]` for a source that takes none. */
  changes: ChangePermissionManifest[];
  capabilities: { read: true; write: boolean; backgroundSync: boolean };
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
  event: [
    'calendarId',
    'isTentative',
    'isFree',
    'sameEventKey',
    'hasTicket',
    'format',
    'buyerFirstName',
    'status',
  ],
  /** `isDone`: finished or paid; `isAutomatic`: the source handles it itself (autopay). A reader never asks the person about either. */
  task: ['isDone', 'isAutomatic'],
  project: [
    'available',
    'pending',
    'sold',
    'newInquiries',
    'collectedCents',
    'leftCents',
  ],
  knowledge: ['rating'],
  artifact: ['status', 'state', 'condition', 'floorPriceCents'],
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

export interface GrantChange {
  isOn: boolean;
  changedAt: number | null;
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
  /** Change permission id to its switch; a missing id reads as off. */
  changes: Record<string, GrantChange>;
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
  /** Change permission id to on or off. */
  changes?: Record<string, boolean>;
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
  extraScopes: string[] | null;
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
  isWritable?: boolean;
}

export interface EndConnectionRequest {
  grantId: string;
  deleteCopies: boolean;
}
