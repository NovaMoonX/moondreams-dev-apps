import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
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
import {
  planStart,
  toStartFields,
  type ResearchUsageDoc,
} from '../nomos/planResearch.js';
import { readUsageIn, writeUsageIn } from './researchStore.js';
import { getVideoSearchDeps } from './videoDeps.js';

const BATCH = 200;
const REFRESH_BATCH = 20;
const VIDEOS_STALE_MS = 30 * 24 * 60 * 60_000;
const VIDEO_MIN_SECONDS = 180;
const VIDEO_MAX_SECONDS = 1200;
const VIDEOS_KEPT = 2;
const USER_PATH = /^apps\/helm\/users\/([^/]+)\/research\/([^/]+)$/;

const NIGHT_MODES = ['learnLater', 'leadTime'];

const isLiveStart = (data: Record<string, unknown>) =>
  data.mode === 'leadTime' || data.needsLiveFacts === true;

/** What a planned item's night writes. A look ahead of a project starts at the depth it was saved with, reserved like any look; a learn-later wish that needs live facts starts a quick one, and any other wish is prepared from what the model knows, with nothing held. */
export function planNightStart(input: {
  id: string;
  data: Record<string, unknown>;
  usage: ResearchUsageDoc | null;
  now: number;
  timeZone: string;
}): { fields: Record<string, unknown>; usage: ResearchUsageDoc | null } {
  const { data, now } = input;
  const cleared = {
    prepareAt: null,
    startedAt: null,
    preparedAt: null,
    cancelledAt: null,
  };
  if (!isLiveStart(data) || input.usage === null) {
    return {
      fields: {
        status: 'preparing',
        depth: 'light',
        isWithoutWeb: true,
        reservedCents: 0,
        lastEditedAt: now,
        ...cleared,
      },
      usage: null,
    };
  }
  const start = planStart({
    id: input.id,
    wanted:
      data.mode === 'leadTime' && data.depth === 'thorough'
        ? 'thorough'
        : 'light',
    usage: input.usage,
    now,
    timeZone: input.timeZone,
  });
  return {
    fields: { ...toStartFields(start, now), ...cleared },
    usage: start.usage,
  };
}

/** Starts a planned item once its night has come, reading it again in the transaction. */
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
      !NIGHT_MODES.includes(String(data.mode)) ||
      typeof data.prepareAt !== 'number' ||
      data.prepareAt > now
    ) {
      return false;
    }
    if (data.status !== 'planned') {
      transaction.update(ref, { prepareAt: null });
      return false;
    }
    const timeZone = String(profileSnap.get('timeZone') ?? 'UTC');
    const usage = isLiveStart(data)
      ? await readUsageIn(transaction, firestore, uid, now, timeZone)
      : null;
    const planned = planNightStart({
      id: researchId,
      data,
      usage,
      now,
      timeZone,
    });
    transaction.update(ref, planned.fields);
    if (planned.usage)
      writeUsageIn(
        transaction,
        firestore,
        uid,
        planned.usage,
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

const isLive = (status: unknown) => status === 'ready' || status === 'offered';

/** An item that is no longer wanted (done, dismissed, planned again, merged) keeps no videos past their month and leaves the oldest-first query, so it never holds a place that a live item needs. */
async function dropVideos(
  firestore: Firestore,
  key: HelmKey,
  ref: DocumentReference,
  fetchedAt: number,
): Promise<Refresh> {
  return firestore.runTransaction<Refresh>(async (transaction) => {
    const current = await transaction.get(ref);
    const data = current.data();
    if (!data || data.videosFetchedAt !== fetchedAt) return 'skipped';
    if (data.mode === 'learnLater' && isLive(data.status)) return 'skipped';
    transaction.update(ref, {
      videosFetchedAt: null,
      ...(data.mode === 'learnLater'
        ? {
            sealed: sealForHelm(key, {
              ...openForHelm(key, data.sealed as SealedPayload),
              videos: [],
            }),
          }
        : {}),
    });
    return 'skipped';
  });
}

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
  if (!data || data.videosFetchedAt !== fetchedAt) return 'skipped';
  if (data.mode !== 'learnLater' || !isLive(data.status)) {
    return dropVideos(firestore, key, ref, fetchedAt);
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

/** Refreshes videos older than 30 days, at most 20 a run (an item no longer wanted is cleared instead, so it never fills the batch), so a link that stopped playing is replaced and the search quota is spread out. Stops when the search is unavailable (no key, past the day's cap, failing) and tries again next run. */
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
