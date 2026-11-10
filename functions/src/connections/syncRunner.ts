import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  MAX_GRANT_ERRORS,
  type CategoryState,
  type ConnectionGrant,
} from '../vendor/connectionsContract.js';
import { readGrant } from './grants.js';
import type { SourceCtx } from './registry.js';
import type { ReaderSink, SinkSession } from './sink.js';
import type { SourceClient } from './sourceClient.js';

export const SYNC_WINDOW_DAYS = 30;
export const SYNC_LEASE_MS = 120_000;
const DAY_MS = 86_400_000;
const MAX_PAGES = 50;
const READ_FAILED = 'readFailed';

export interface SyncDeps {
  firestore: Firestore;
  source: SourceClient;
  sinks: Record<string, ReaderSink>;
  now: () => number;
}

export type SyncOutcome = 'synced' | 'skipped';

interface CategoryResult {
  category: string;
  ok: { state: CategoryState; keptCount: number } | null;
  failedAt: number | null;
}

const grantRef = (firestore: Firestore, uid: string, grantId: string) =>
  firestore.doc(`connections/${uid}/grants/${grantId}`);

const takeLease = (
  firestore: Firestore,
  uid: string,
  grantId: string,
  now: number,
) =>
  firestore.runTransaction(async (transaction) => {
    const ref = grantRef(firestore, uid, grantId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const grant = readGrant(snapshot.data());
    const isHeld = grant.syncLeaseUntil !== null && grant.syncLeaseUntil > now;
    if (grant.status === 'ended' || isHeld) return null;
    transaction.update(ref, { syncLeaseUntil: now + SYNC_LEASE_MS });
    return grant;
  });

async function syncCategory(
  deps: SyncDeps,
  session: SinkSession,
  ctx: SourceCtx,
  grantId: string,
  category: string,
  windowStart: number,
): Promise<CategoryResult> {
  const { grant } = ctx;
  const now = deps.now();
  try {
    const run = async (
      cursor: string | null,
      pages: number,
      isFull: boolean,
    ) => {
      const page = await deps.source.syncPage(grant.connectorId, ctx, {
        category,
        cursor,
        windowStart,
      });
      await session.writePage({
        grantId,
        connectorId: grant.connectorId,
        accountId: grant.accountId,
        category,
        records: page.records,
        isFull: page.isFull,
        windowStart,
        now,
        deepLink: (ref) => deps.source.deepLink(grant.connectorId, ref, ctx),
      });
      const isStillFull = isFull && page.isFull;
      if (page.isDone || page.cursor === null || pages + 1 >= MAX_PAGES)
        return isStillFull && page.isDone;
      return run(page.cursor, pages + 1, isStillFull);
    };
    const isFull = await run(null, 0, true);
    const totals = await session.finishCategory({
      grantId,
      category,
      isFull,
      windowStart,
      now,
    });
    return {
      category,
      ok: {
        state: { lastOkAt: now, lastError: null, count: totals.count },
        keptCount: totals.keptCount,
      },
      failedAt: null,
    };
  } catch {
    logger.warn('connections.sync.categoryFailed', {
      connectorId: grant.connectorId,
      category,
      code: READ_FAILED,
    });
    return { category, ok: null, failedAt: now };
  }
}

const sequence = <T>(items: (() => Promise<T>)[]) =>
  items.reduce<Promise<T[]>>(
    async (done, next) => [...(await done), await next()],
    Promise.resolve([]),
  );

/** One grant's sync: a short lease, each switched-on category read and handed to the reader's sink, then the grant's state written once. */
export async function syncGrant(
  deps: SyncDeps,
  uid: string,
  grantId: string,
): Promise<SyncOutcome> {
  const startedAt = deps.now();
  const grant = await takeLease(deps.firestore, uid, grantId, startedAt);
  if (!grant) return 'skipped';
  const sink = Object.hasOwn(deps.sinks, grant.readerAppId)
    ? deps.sinks[grant.readerAppId]
    : undefined;
  const ref = grantRef(deps.firestore, uid, grantId);
  if (!sink) {
    await ref.update({ syncLeaseUntil: null });
    return 'skipped';
  }

  const ctx: SourceCtx = { uid, accountId: grant.accountId, grant };
  const status = await deps.source.status(grant.connectorId, ctx);
  if (status !== 'ok') {
    await ref.update({
      status,
      syncLeaseUntil: null,
      updatedAt: deps.now(),
    });
    logger.info('connections.sync.status', {
      connectorId: grant.connectorId,
      status,
    });
    return 'synced';
  }

  const session = sink.openSession(deps.firestore, uid);
  const windowStart = startedAt - SYNC_WINDOW_DAYS * DAY_MS;
  const results = await sequence(
    Object.entries(grant.categories)
      .filter(([, category]) => category.isOn)
      .map(
        ([category]) =>
          () =>
            syncCategory(deps, session, ctx, grantId, category, windowStart),
      ),
  );
  await settle(deps, session, uid, grantId, results);
  logger.info('connections.sync.done', {
    connectorId: grant.connectorId,
    ok: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    durationMs: deps.now() - startedAt,
  });
  return 'synced';
}

const toKeptCopies = (
  grant: ConnectionGrant,
  results: CategoryResult[],
  keptCount: number,
): ConnectionGrant['keptCopies'] => {
  if (!grant.keptCopies || results.some((result) => !result.ok))
    return grant.keptCopies;
  return keptCount > 0
    ? { count: keptCount, deleteAfter: grant.keptCopies.deleteAfter }
    : null;
};

async function settle(
  deps: SyncDeps,
  session: SinkSession,
  uid: string,
  grantId: string,
  results: CategoryResult[],
) {
  const ref = grantRef(deps.firestore, uid, grantId);
  const now = deps.now();
  const fresh = await deps.firestore.runTransaction(async (transaction) => {
    const current = readGrant((await transaction.get(ref)).data());
    if (current.status === 'ended') return current;
    const stillOn = results.filter(
      (result) => current.categories[result.category]?.isOn === true,
    );
    const errors = [
      ...stillOn.flatMap((result) =>
        result.failedAt === null
          ? []
          : [
              {
                category: result.category,
                code: READ_FAILED,
                at: result.failedAt,
              },
            ],
      ),
      ...current.errors.filter(
        (error) =>
          !stillOn.some((result) => result.category === error.category),
      ),
    ].slice(0, MAX_GRANT_ERRORS);
    const keptCopies = toKeptCopies(
      current,
      stillOn,
      stillOn.reduce((total, result) => total + (result.ok?.keptCount ?? 0), 0),
    );
    transaction.update(ref, {
      ...Object.fromEntries(
        stillOn.map((result) => [
          `categoryState.${result.category}`,
          result.ok?.state ?? {
            lastOkAt: current.categoryState[result.category]?.lastOkAt ?? null,
            count: current.categoryState[result.category]?.count ?? 0,
            lastError: { code: READ_FAILED, at: result.failedAt ?? now },
          },
        ]),
      ),
      ...(current.status === 'live' ? {} : { status: 'live' }),
      errors,
      keptCopies,
      lastSyncAt: now,
      syncLeaseUntil: null,
      updatedAt: now,
    });
    return current;
  });

  if (fresh.status === 'ended') {
    await (fresh.keptCopies && fresh.endedAt !== null
      ? session.keepGrant(
          grantId,
          fresh.endedAt,
          fresh.keptCopies.deleteAfter ?? fresh.endedAt,
        )
      : session.deleteGrant(grantId));
    return;
  }
  await Promise.all(
    results
      .filter((result) => fresh.categories[result.category]?.isOn !== true)
      .map((result) => session.deleteCategory(grantId, result.category)),
  );
}
