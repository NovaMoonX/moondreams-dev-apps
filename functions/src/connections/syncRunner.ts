import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  MAX_GRANT_ERRORS,
  type CategoryState,
  type ConnectionGrant,
} from '../vendor/connectionsContract.js';
import { readGrant } from './grants.js';
import { ReconnectNeeded } from './tokens.js';
import type { SourceCtx } from './registry.js';
import type { ReaderSink, SinkSession } from './sink.js';
import type { SourceClient } from './sourceClient.js';

export const SYNC_WINDOW_DAYS = 30;
// Longer than the slowest run the callable's timeout allows, so two runs never overlap on one grant.
export const SYNC_LEASE_MS = 300_000;
const DAY_MS = 86_400_000;
const MAX_PAGES = 50;
const READ_FAILED = 'readFailed';
const NEEDS_RECONNECT = 'needsReconnect';

const cursorsPath = (uid: string) => `connectionsServer/${uid}/cursors`;
const cursorId = (grantId: string, category: string) =>
  `${grantId}__${category}`;

/** Forgets what the next read would resume from, so it reads in full: one category, or all of the grant's when `category` is null. */
export async function clearSyncCursors(
  firestore: Firestore,
  uid: string,
  grantId: string,
  category: string | null,
) {
  const refs = (
    await firestore.collection(cursorsPath(uid)).listDocuments()
  ).filter((ref) =>
    category === null
      ? ref.id.startsWith(`${grantId}__`)
      : ref.id === cursorId(grantId, category),
  );
  await Promise.all(refs.map((ref) => ref.delete()));
}

export interface SyncDeps {
  firestore: Firestore;
  source: SourceClient;
  sinks: Record<string, ReaderSink>;
  now: () => number;
}

export type SyncOutcome = 'synced' | 'skipped';

interface CategoryResult {
  category: string;
  ok: { state: CategoryState } | null;
  failedAt: number | null;
  errorCode: string;
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
    const cursorRef = deps.firestore.doc(
      `${cursorsPath(ctx.uid)}/${cursorId(grantId, category)}`,
    );
    const saved = (await cursorRef.get()).get('state');
    const run = async (
      cursor: string | null,
      pages: number,
    ): Promise<{ isFull: boolean; resumeState: string | null }> => {
      const page = await deps.source.syncPage(grant.connectorId, ctx, {
        category,
        cursor,
        resumeState: pages === 0 && typeof saved === 'string' ? saved : null,
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
      if (page.deletedRefs.length > 0)
        await session.deleteRefs(grantId, category, page.deletedRefs);
      // A gone token restarts the read from its first page, so the last page
      // alone says whether the read was complete.
      if (page.isDone || page.cursor === null)
        return {
          isFull: page.isFull && page.isDone,
          resumeState: page.isDone ? page.resumeState : null,
        };
      if (pages + 1 >= MAX_PAGES) return { isFull: false, resumeState: null };
      return run(page.cursor, pages + 1);
    };
    const { isFull, resumeState } = await run(null, 0);
    const totals = await session.finishCategory({
      grantId,
      category,
      isFull,
      windowStart,
      now,
    });
    await (resumeState === null
      ? cursorRef.delete()
      : cursorRef.set({ state: resumeState, updatedAt: now }));
    return {
      category,
      ok: {
        state: { lastOkAt: now, lastError: null, count: totals.count },
      },
      failedAt: null,
      errorCode: READ_FAILED,
    };
  } catch (error) {
    const errorCode =
      error instanceof ReconnectNeeded ? NEEDS_RECONNECT : READ_FAILED;
    logger.warn('connections.sync.categoryFailed', {
      connectorId: grant.connectorId,
      grantId,
      category,
      code: errorCode,
      cause: errorCause(error),
    });
    return { category, ok: null, failedAt: now, errorCode };
  }
}

/** The error's name and code only: never its message, which can carry what was read. */
export const errorCause = (error: unknown) => ({
  name: error instanceof Error ? error.name : typeof error,
  code:
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : null,
});

const sequence = (items: (() => Promise<CategoryResult>)[]) =>
  items.reduce<Promise<CategoryResult[]>>(async (done, next) => {
    const results = await done;
    return results.some((result) => result.errorCode === NEEDS_RECONNECT)
      ? results
      : [...results, await next()];
  }, Promise.resolve([]));

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
  try {
    return await runLeased(deps, uid, grantId, grant, sink, startedAt);
  } catch (error) {
    await releaseLease(deps.firestore, ref).catch(() => undefined);
    throw error;
  }
}

const releaseLease = (
  firestore: Firestore,
  ref: DocumentReference,
  fields: Record<string, unknown> = {},
) =>
  firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    const isEnded = readGrant(snapshot.data()).status === 'ended';
    transaction.update(ref, {
      ...(isEnded ? {} : fields),
      syncLeaseUntil: null,
    });
  });

async function runLeased(
  deps: SyncDeps,
  uid: string,
  grantId: string,
  grant: ConnectionGrant,
  sink: ReaderSink | undefined,
  startedAt: number,
): Promise<SyncOutcome> {
  const ref = grantRef(deps.firestore, uid, grantId);
  if (!sink) {
    await releaseLease(deps.firestore, ref);
    return 'skipped';
  }

  const ctx: SourceCtx = { uid, accountId: grant.accountId, grant };
  const status = await deps.source.status(grant.connectorId, ctx);
  if (status !== 'ok') {
    await releaseLease(deps.firestore, ref, { status, updatedAt: deps.now() });
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
  const keptCount = await session.countKept(grantId);
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
                code: result.errorCode,
                at: result.failedAt,
              },
            ],
      ),
      ...current.errors.filter(
        (error) =>
          !stillOn.some((result) => result.category === error.category),
      ),
    ].slice(0, MAX_GRANT_ERRORS);
    const keptCopies = toKeptCopies(current, stillOn, keptCount);
    transaction.update(ref, {
      ...Object.fromEntries(
        stillOn.map((result) => [
          `categoryState.${result.category}`,
          result.ok?.state ?? {
            lastOkAt: current.categoryState[result.category]?.lastOkAt ?? null,
            count: current.categoryState[result.category]?.count ?? 0,
            lastError: { code: result.errorCode, at: result.failedAt ?? now },
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
  const categoryIds = Array.from(
    new Set([
      ...Object.keys(fresh.categories),
      ...Object.keys(fresh.categoryState),
      ...results.map((result) => result.category),
    ]),
  );
  await Promise.all(
    categoryIds
      .filter((id) => fresh.categories[id]?.isOn !== true)
      .map((id) =>
        Promise.all([
          session.deleteCategory(grantId, id),
          clearSyncCursors(deps.firestore, uid, grantId, id),
        ]),
      ),
  );
}
