import {
  SOURCE_ADAPTERS,
  type SourceCtx,
  type SourceStatus,
  type SyncPageRequest,
  type SyncPageResult,
} from './registry.js';

export interface SourceClient {
  status(connectorId: string, ctx: SourceCtx): Promise<SourceStatus>;
  syncPage(
    connectorId: string,
    ctx: SourceCtx,
    req: SyncPageRequest,
  ): Promise<SyncPageResult>;
  deepLink(connectorId: string, ref: string, ctx: SourceCtx): string | null;
  /** True for a category read only when asked, which a sync never touches. */
  isLive?(connectorId: string, category: string): boolean;
  /** Days of ended records a category keeps, when its manifest asks for more than the usual window. */
  historyDays?(connectorId: string, category: string): number | null;
}

const getAdapter = (connectorId: string) => {
  const adapter = Object.hasOwn(SOURCE_ADAPTERS, connectorId)
    ? SOURCE_ADAPTERS[connectorId]
    : undefined;
  if (!adapter) throw new Error('No adapter is registered for this source.');
  return adapter;
};

export class InProcessSourceClient implements SourceClient {
  status(connectorId: string, ctx: SourceCtx) {
    return getAdapter(connectorId).status(ctx);
  }

  syncPage(connectorId: string, ctx: SourceCtx, req: SyncPageRequest) {
    return getAdapter(connectorId).syncPage(ctx, req);
  }

  deepLink(connectorId: string, ref: string, ctx: SourceCtx) {
    return getAdapter(connectorId).deepLink(ref, ctx);
  }

  isLive(connectorId: string, category: string) {
    return getAdapter(connectorId).manifest.categories.some(
      (entry) => entry.id === category && entry.mode === 'live',
    );
  }

  historyDays(connectorId: string, category: string) {
    return (
      getAdapter(connectorId).manifest.categories.find(
        (entry) => entry.id === category,
      )?.historyDays ?? null
    );
  }
}
