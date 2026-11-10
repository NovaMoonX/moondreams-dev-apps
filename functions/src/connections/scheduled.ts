import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { syncDeps } from './callables.js';
import { expireCopies } from './expire.js';
import { READER_SINKS } from './registry.js';
import { readGrant } from './grants.js';
import { syncGrant } from './syncRunner.js';

if (getApps().length === 0) {
  initializeApp();
}

const STALE_MS = 50 * 60_000;
const HOURLY_LIMIT = 200;

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
    const synced = await due.reduce(async (done, doc) => {
      const total = await done;
      const uid = doc.ref.parent.parent?.id;
      if (!uid) return total;
      try {
        return (await syncGrant(deps, uid, doc.id)) === 'synced'
          ? total + 1
          : total;
      } catch {
        logger.error('connections.sync.grantFailed');
        return total;
      }
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
