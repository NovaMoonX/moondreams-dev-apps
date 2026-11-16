import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { searchVideos } from '../../../videoSearch/searchVideos.js';
import type { Keyring } from '../../../appKeys/keyring.js';
import type { SealedPayload } from '../../../appKeys/seal.js';
import {
  openForHelm,
  sealForHelm,
  unwrapHelmKey,
  type HelmKey,
} from '../helmKey.js';
import { planStart, toStartFields } from '../nomos/planResearch.js';
import { readUsageIn, writeUsageIn } from './researchStore.js';
import { getVideoSearchDeps } from './videoDeps.js';

const BATCH = 200;
const REFRESH_BATCH = 20;
const VIDEOS_STALE_MS = 30 * 24 * 60 * 60_000;
const VIDEO_MIN_SECONDS = 180;
const VIDEO_MAX_SECONDS = 1200;
const VIDEOS_KEPT = 2;
const USER_PATH = /^apps\/helm\/users\/([^/]+)\/research\/([^/]+)$/;

/** Starts a planned item once its night has come. A wish that needs live facts is reserved from the month's allowance like any look (and runs from what the model knows when the month is spent); any other wish is prepared from what the model knows, with nothing held. Reads the item again in the transaction. */
async function startOne(
  firestore: Firestore,
  uid: string,
  researchId: string,
  now: number,
) {
  const base = `apps/helm/users/${uid}`;
  const ref = firestore.doc(`${base}/research/${researchId}`);
  return firestore.runTransaction(async (transaction) => {
    const [snap, profileSnap] = await Promise.all([
      transaction.get(ref),
      transaction.get(firestore.doc(base)),
    ]);
    const data = snap.data();
    if (
      !data ||
      data.mode !== 'learnLater' ||
      typeof data.prepareAt !== 'number' ||
      data.prepareAt > now
    ) {
      return false;
    }
    if (data.status !== 'planned') {
      transaction.update(ref, { prepareAt: null });
      return false;
    }
    const cleared = {
      prepareAt: null,
      startedAt: null,
      preparedAt: null,
      cancelledAt: null,
    };
    if (data.needsLiveFacts !== true) {
      transaction.update(ref, {
        status: 'preparing',
        depth: 'light',
        isWithoutWeb: true,
        reservedCents: 0,
        lastEditedAt: now,
        ...cleared,
      });
      return true;
    }
    const timeZone = String(profileSnap.get('timeZone') ?? 'UTC');
    const usage = await readUsageIn(transaction, firestore, uid, now, timeZone);
    const start = planStart({
      id: researchId,
      wanted: 'light',
      usage,
      now,
      timeZone,
    });
    transaction.update(ref, { ...toStartFields(start, now), ...cleared });
    writeUsageIn(
      transaction,
      firestore,
      uid,
      start.usage,
      now,
      timeZone,
      profileSnap.exists,
    );
    return true;
  });
}

/** Starts every planned learn-later item whose night has come; each then runs through the same trigger as any preparing item. */
export async function startDueLearnLater(firestore: Firestore, now: number) {
  const due = await firestore
    .collectionGroup('research')
    .where('prepareAt', '<=', now)
    .orderBy('prepareAt')
    .limit(BATCH)
    .get();
  const started = await Promise.all(
    due.docs.flatMap((doc) => {
      const owner = USER_PATH.exec(doc.ref.path);
      return owner
        ? [
            startOne(firestore, owner[1], owner[2], now).catch(() => {
              logger.warn('helm.learnLater.startFailed');
              return false;
            }),
          ]
        : [];
    }),
  );
  return started.filter(Boolean).length;
}

type Refresh = 'refreshed' | 'skipped' | 'unavailable';

/** Looks again for the videos of one ready or offered item, or drops them when it has no search to repeat. A search that could not run leaves the item as it was. */
async function refreshOne(
  firestore: Firestore,
  key: HelmKey,
  path: string,
  fetchedAt: number,
  now: number,
): Promise<Refresh> {
  const ref = firestore.doc(path);
  const snap = await ref.get();
  const data = snap.data();
  if (
    !data ||
    data.mode !== 'learnLater' ||
    (data.status !== 'ready' && data.status !== 'offered') ||
    data.videosFetchedAt !== fetchedAt
  ) {
    return 'skipped';
  }
  const opened = openForHelm(key, data.sealed as SealedPayload);
  const query =
    typeof opened.searchQuery === 'string' ? opened.searchQuery : null;
  const found =
    query === null
      ? { videos: [], skipped: null }
      : await searchVideos(
          {
            query,
            limit: VIDEOS_KEPT,
            minSeconds: VIDEO_MIN_SECONDS,
            maxSeconds: VIDEO_MAX_SECONDS,
          },
          getVideoSearchDeps(firestore),
        );
  if (found.skipped !== null) return 'unavailable';
  return firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (current.get('videosFetchedAt') !== fetchedAt) return 'skipped';
    transaction.update(ref, {
      videosFetchedAt: query === null ? null : now,
      sealed: sealForHelm(key, { ...opened, videos: found.videos }),
    });
    return 'refreshed';
  });
}

/** Refreshes videos older than 30 days, at most 20 a run, so a link that stopped playing is replaced and the search quota is spread out. Stops when the search is unavailable (no key, past the day's cap, failing) and tries again next run. */
export async function refreshOldVideos(
  firestore: Firestore,
  keyring: Keyring,
  now: number,
) {
  const old = await firestore
    .collectionGroup('research')
    .where('videosFetchedAt', '<=', now - VIDEOS_STALE_MS)
    .orderBy('videosFetchedAt')
    .limit(REFRESH_BATCH)
    .get();
  const keys = new Map<string, HelmKey | null>();
  let refreshed = 0;
  for (const doc of old.docs) {
    const owner = USER_PATH.exec(doc.ref.path);
    if (!owner) continue;
    if (!keys.has(owner[1])) {
      keys.set(
        owner[1],
        await unwrapHelmKey(firestore, keyring, owner[1]).catch(() => null),
      );
    }
    const key = keys.get(owner[1]) ?? null;
    if (key === null) continue;
    const outcome = await refreshOne(
      firestore,
      key,
      doc.ref.path,
      Number(doc.get('videosFetchedAt')),
      now,
    ).catch(() => 'skipped' as const);
    if (outcome === 'unavailable') break;
    if (outcome === 'refreshed') refreshed += 1;
  }
  return refreshed;
}
