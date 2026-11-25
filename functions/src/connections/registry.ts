import type { Firestore } from 'firebase-admin/firestore';
import type { SecretParam } from 'firebase-functions/params';
import type { ZodRawShape } from 'zod';

import type {
  ConnectionGrant,
  ConnectorManifest,
  ConnectorOption,
  SharedRecord,
} from '../vendor/connectionsContract.js';
import { createHelmSink } from '../apps/helm/connections/sink.js';
import { createAListAdapter } from '../apps/a-list/share/adapter.js';
import { createGoingOnceAdapter } from '../apps/going-once/share/adapter.js';
import { createNineLivesAdapter } from '../apps/nine-lives/share/adapter.js';
import { createPinchAdapter } from '../apps/pinch/share/adapter.js';
import { createRunwayAdapter } from '../apps/runway/share/adapter.js';
import { createWaypointAdapter } from '../apps/waypoint/share/adapter.js';
import { createWorthTheWaitAdapter } from '../apps/worth-the-wait/share/adapter.js';
import { createGoogleCalendarAdapter } from './google/calendar.js';
import { createGoogleContactsAdapter } from './google/contacts.js';
import { createGoogleDriveAdapter } from './google/drive.js';
import { createGoogleMailAdapter } from './google/gmail.js';
import type { ReaderSink } from './sink.js';

export interface SourceCtx {
  uid: string;
  accountId: string;
  grant: ConnectionGrant;
}

export interface SyncPageRequest {
  category: string;
  cursor: string | null;
  /** What the last finished read of this category handed back, given on the first page only. */
  resumeState: string | null;
  windowStart: number;
}

export interface SyncPageResult {
  records: SharedRecord[];
  deletedRefs: string[];
  cursor: string | null;
  isFull: boolean;
  isDone: boolean;
  /** Kept for the next run once the category finishes; null keeps nothing. */
  resumeState: string | null;
}

/** What every live category accepts; an adapter ignores what its records do not carry. Days are YYYY-MM-DD. */
export interface LiveQueryArgs {
  text?: string | null;
  from?: string | null;
  to?: string | null;
  /** The reader's IANA zone; instant fields are matched by their day there, date-only fields stay UTC. */
  timeZone?: string | null;
}

export interface LiveQueryRequest {
  category: string;
  args: unknown;
}

export interface LiveQueryResult {
  records: SharedRecord[];
  matchedCount: number;
  totalCents: number | null;
  currency: string | null;
  isPartial: boolean;
  from: string | null;
  to: string | null;
}

export type SourceStatus = 'ok' | 'noAccess' | 'needsReconnect';

export interface SourceAdapter {
  manifest: ConnectorManifest;
  /** Secrets the adapter reads, so every function that runs it declares them. */
  secrets?: SecretParam[];
  status(ctx: SourceCtx): Promise<SourceStatus>;
  syncPage(ctx: SourceCtx, req: SyncPageRequest): Promise<SyncPageResult>;
  query?(ctx: SourceCtx, req: LiveQueryRequest): Promise<LiveQueryResult>;
  /** A site path under the source's own route, or null. */
  deepLink(ref: string, ctx: SourceCtx): string | null;
  /** What the app offers an assistant, by the ids its manifest lists in `actions`. */
  actions?: Record<string, ServerAppAction>;
  /** Takes one change an action recorded back; refuses with a sentence once what it touched has moved on. `from` is where the person asked. */
  undoChange?(
    firestore: Firestore,
    uid: string,
    changeId: string,
    from: 'pinch' | 'helm',
  ): Promise<UndoChangeResult>;
  /** The choices the account offers (calendars), read live. */
  readOptions?(args: {
    firestore: Firestore;
    uid: string;
    accountId: string;
  }): Promise<ConnectorOption[]>;
}

/** `isSettled`: nothing is left to take back, so a caller stops offering Undo. */
export type UndoChangeResult =
  { ok: true } | { ok: false; message: string; isSettled: boolean };

export interface ServerAppActionCtx {
  uid: string;
  grant: ConnectionGrant;
  /** The share categories the person has on right now. */
  allowedCategories: Set<string>;
  actor: { kind: 'outside' | 'nomos'; name: string };
  now: number;
  /** The person's own IANA zone. */
  timeZone: string;
}

export type AppActionResult =
  | {
      status: 'ok';
      data: unknown;
      heldBack: { category: string; label: string }[];
    }
  /** `category` is the share category, or the change permission's id for a change. */
  | { status: 'switchedOff'; needs: { category: string; label: string }[] }
  | { status: 'notFound'; message: string }
  | { status: 'refused'; message: string };

/** One action a site app offers an assistant, keyed in `SourceAdapter.actions` by its manifest id. */
export interface ServerAppAction {
  /** Written for an assistant: what it returns, what each argument is and where its ids come from. */
  description: string;
  shape: ZodRawShape;
  run(
    ctx: ServerAppActionCtx,
    input: Record<string, unknown>,
  ): Promise<AppActionResult>;
}

export const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  'app:pinch': createPinchAdapter(),
  'app:a-list': createAListAdapter(),
  'app:going-once': createGoingOnceAdapter(),
  'app:nine-lives': createNineLivesAdapter(),
  'app:runway': createRunwayAdapter(),
  'app:waypoint': createWaypointAdapter(),
  'app:worth-the-wait': createWorthTheWaitAdapter(),
  'google:calendar': createGoogleCalendarAdapter(),
  'google:gmail': createGoogleMailAdapter(),
  'google:drive': createGoogleDriveAdapter(),
  'google:contacts': createGoogleContactsAdapter(),
};

export const SOURCE_SECRETS: SecretParam[] = Array.from(
  new Map(
    Object.values(SOURCE_ADAPTERS)
      .flatMap((adapter) => adapter.secrets ?? [])
      .map((secret) => [secret.name, secret]),
  ).values(),
);

export const READER_APPS: Record<
  string,
  {
    grantPagePath: (grantId: string) => string;
    /** The feature switch a restricted connector needs open, by connector. */
    restrictedGates: Record<
      string,
      { gateId: string; defaultRollout: 'off' | 'testing' | 'everyone' }
    >;
  }
> = {
  helm: {
    restrictedGates: {
      'google:gmail': {
        gateId: 'google-mail-and-drive',
        defaultRollout: 'testing',
      },
      'google:drive': {
        gateId: 'google-mail-and-drive',
        defaultRollout: 'testing',
      },
    },
    grantPagePath: (grantId) =>
      `/helm?view=connection&grant=${encodeURIComponent(grantId)}`,
  },
};

export const READER_SINKS: Record<string, ReaderSink> = {
  helm: createHelmSink(),
};
