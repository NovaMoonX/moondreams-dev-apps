import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { loadKeyring, RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import { ITEM_INDEX_PATH, type ItemIndexDoc } from './link/grant.js';
import { LINK_SECRETS, planDocPath } from './link/linkShared.js';
import { syncRunwayLink } from './link/syncRunwayLink.js';

if (getApps().length === 0) {
  initializeApp();
}

const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const PARALLEL_LINKS = 5;

/** Catches what a missed webhook left: every active link not synced for six hours. */
export const syncRunwayAccounts = onSchedule(
  {
    region: 'us-central1',
    schedule: '0 */6 * * *',
    timeZone: 'UTC',
    timeoutSeconds: 540,
    secrets: [...LINK_SECRETS, RUNWAY_MASTER_KEYS],
  },
  async () => {
    const firestore = getFirestore();
    const keyring = loadKeyring();
    const now = Date.now();
    const items = await firestore.collection(ITEM_INDEX_PATH).get();
    const due = (
      await Promise.all(
        items.docs.map(async (item) => {
          const { uid, linkId } = item.data() as ItemIndexDoc;
          const link = await firestore
            .doc(planDocPath(uid, 'links', linkId))
            .get();
          const data = link.data();
          const isDue =
            link.exists &&
            data?.status === 'active' &&
            now - ((data.lastSyncAt as number | null) ?? 0) > STALE_AFTER_MS;
          return isDue ? [{ uid, linkId }] : [];
        }),
      )
    ).flat();
    const chunks = Array.from(
      { length: Math.ceil(due.length / PARALLEL_LINKS) },
      (_, index) =>
        due.slice(index * PARALLEL_LINKS, (index + 1) * PARALLEL_LINKS),
    );
    const states = await chunks.reduce<Promise<string[]>>(
      async (previous, chunk) => [
        ...(await previous),
        ...(await Promise.all(
          chunk.map(
            async ({ uid, linkId }) =>
              (await syncRunwayLink(firestore, keyring, uid, linkId)).state,
          ),
        )),
      ],
      Promise.resolve([]),
    );
    logger.info('runway.sync.backstop', {
      checked: items.size,
      synced: states.filter((state) => state === 'ok').length,
      failed: states.filter((state) => state === 'failed').length,
    });
  },
);
