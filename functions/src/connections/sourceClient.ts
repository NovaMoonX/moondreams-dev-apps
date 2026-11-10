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
}
