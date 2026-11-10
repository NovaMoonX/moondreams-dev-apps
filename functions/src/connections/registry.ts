import type {
  ConnectionGrant,
  ConnectorManifest,
  SharedRecord,
} from '../vendor/connectionsContract.js';
import { createHelmSink } from '../apps/helm/connections/sink.js';
import { createPinchAdapter } from '../apps/pinch/share/adapter.js';
import type { ReaderSink } from './sink.js';

export interface SourceCtx {
  uid: string;
  accountId: string;
  grant: ConnectionGrant;
}

export interface SyncPageRequest {
  category: string;
  cursor: string | null;
  windowStart: number;
}

export interface SyncPageResult {
  records: SharedRecord[];
  deletedRefs: string[];
  cursor: string | null;
  isFull: boolean;
  isDone: boolean;
}

export type SourceStatus = 'ok' | 'noAccess' | 'needsReconnect';

export interface SourceAdapter {
  manifest: ConnectorManifest;
  status(ctx: SourceCtx): Promise<SourceStatus>;
  syncPage(ctx: SourceCtx, req: SyncPageRequest): Promise<SyncPageResult>;
  /** A site path under the source's own route, or null. */
  deepLink(ref: string, ctx: SourceCtx): string | null;
}

export const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  'app:pinch': createPinchAdapter(),
};

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
