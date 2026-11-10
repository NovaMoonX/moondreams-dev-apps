import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { syncDeps } from './callables.js';
import { expireCopies } from './expire.js';
import { READER_SINKS } from './registry.js';
import { readGrant } from './grants.js';
import { errorCause, syncGrant } from './syncRunner.js';

if (getApps().length === 0) {
  initializeApp();
}

const STALE_MS = 50 * 60_000;
const HOURLY_LIMIT = 200;
const PARALLEL_GRANTS = 5;

/** Syncs every live grant that has gone 50 minutes without one, never-synced ones first, oldest first, up to 200 a run. */
export const syncConnectionsHourly = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeoutSeconds: 540,
    secrets: Object.values(READER_SINKS).flatMap((sink) => sink.secrets),
  },
  async () => {
    const deps = syncDeps();
    const live = getFirestore()
      .collectionGroup('grants')
      .where('status', '==', 'live');
    const [never, stale] = await Promise.all([
      live.where('lastSyncAt', '==', null).limit(HOURLY_LIMIT).get(),
      live
        .where('lastSyncAt', '<', deps.now() - STALE_MS)
        .orderBy('lastSyncAt')
        .limit(HOURLY_LIMIT)
        .get(),
    ]);
    const due = [...never.docs, ...stale.docs]
      .filter((doc) =>
        Object.hasOwn(READER_SINKS, readGrant(doc.data()).readerAppId),
      )
      .slice(0, HOURLY_LIMIT);
    const runOne = async (doc: (typeof due)[number]): Promise<number> => {
      const uid = doc.ref.parent.parent?.id;
      if (!uid) return 0;
      try {
        return (await syncGrant(deps, uid, doc.id)) === 'synced' ? 1 : 0;
      } catch (error) {
        logger.error('connections.sync.grantFailed', {
          grantId: doc.id,
          cause: errorCause(error),
        });
        return 0;
      }
    };
    const batches = Array.from(
      { length: Math.ceil(due.length / PARALLEL_GRANTS) },
      (_, index) =>
        due.slice(index * PARALLEL_GRANTS, (index + 1) * PARALLEL_GRANTS),
    );
    const synced = await batches.reduce(async (done, batch) => {
      const total = await done;
      const counts = await Promise.all(batch.map(runOne));
      return total + counts.reduce((sum, count) => sum + count, 0);
    }, Promise.resolve(0));
    logger.info('connections.sync.hourly', { due: due.length, synced });
  },
);

/** Deletes kept copies whose 90 days are up, once a day. */
export const expireKeptCopies = onSchedule(
  { schedule: '17 5 * * *', timeoutSeconds: 300 },
  async () => {
    await expireCopies(getFirestore(), READER_SINKS, Date.now());
  },
);
