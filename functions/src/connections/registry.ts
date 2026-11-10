import type { Firestore } from 'firebase-admin/firestore';
import type { SecretParam } from 'firebase-functions/params';

import type {
  ConnectionGrant,
  ConnectorManifest,
  ConnectorOption,
  SharedRecord,
} from '../vendor/connectionsContract.js';
import { createHelmSink } from '../apps/helm/connections/sink.js';
import { createAListAdapter } from '../apps/a-list/share/adapter.js';
import { createPinchAdapter } from '../apps/pinch/share/adapter.js';
import { createGoogleCalendarAdapter } from './google/calendar.js';
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

export type SourceStatus = 'ok' | 'noAccess' | 'needsReconnect';

export interface SourceAdapter {
  manifest: ConnectorManifest;
  /** Secrets the adapter reads, so every function that runs it declares them. */
  secrets?: SecretParam[];
  status(ctx: SourceCtx): Promise<SourceStatus>;
  syncPage(ctx: SourceCtx, req: SyncPageRequest): Promise<SyncPageResult>;
  /** A site path under the source's own route, or null. */
  deepLink(ref: string, ctx: SourceCtx): string | null;
  /** The choices the account offers (calendars), read live. */
  readOptions?(args: {
    firestore: Firestore;
    uid: string;
    accountId: string;
  }): Promise<ConnectorOption[]>;
}

export const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  'app:pinch': createPinchAdapter(),
  'app:a-list': createAListAdapter(),
  'google:calendar': createGoogleCalendarAdapter(),
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
  { grantPagePath: (grantId: string) => string }
> = {
  helm: {
    grantPagePath: (grantId) =>
      `/helm?view=connection&grant=${encodeURIComponent(grantId)}`,
  },
};

export const READER_SINKS: Record<string, ReaderSink> = {
  helm: createHelmSink(),
};
