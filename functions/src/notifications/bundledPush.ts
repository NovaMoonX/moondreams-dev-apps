import type { Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';

import { goingOnceBundleHooks } from '../apps/going-once/bundleHooks.js';
import { getLocalClock } from './localClock.js';
import { QUIET_UNTIL_HOUR, isQuietHour } from './pushBudget.js';
import { sendPushToUsers, type PushContent } from './sendPush.js';
import { zonedDateTimeToEpoch } from './zonedTime.js';

/** One thing waiting to be told to a person. */
export interface BundleItem {
  /** What makes it the same item when queued twice. */
  key: string;
  /** What the item belongs to (the app decides: a sale, a trip). */
  groupId: string;
  label: string;
  groupLabel: string;
  /** Absolute, on the app's own origin: where a tap on this item alone opens. */
  url: string;
  queuedAt: number;
}

export interface BundleState {
  lastSentAt: number | null;
  nextSendAt: number | null;
  items: BundleItem[];
  zone: string | null;
}

export interface SummaryContext {
  /** Some of the items came in during quiet hours. */
  isOvernight: boolean;
}

export interface BundleHooks {
  /** The items that still matter now; the app reads whatever it needs to know. */
  confirmItems: (
    firestore: Firestore,
    uid: string,
    items: BundleItem[],
  ) => Promise<BundleItem[]>;
  /** The one push for the items (never empty), in the app's words. */
  summarize: (items: BundleItem[], context: SummaryContext) => PushContent;
}

/** An app's hooks by `appId`; an app not listed here has its waiting items cleared and logged. */
export const BUNDLE_HOOKS: Record<string, BundleHooks> = {
  'going-once': goingOnceBundleHooks,
};

/** At most one push per person per app in this long. */
export const BUNDLE_WINDOW_MS = 15 * 60_000;

/** The newest items kept for one person; older ones are dropped, the count in the summary is of what is kept. */
export const MAX_BUNDLE_ITEMS = 50;

/** At most this many bundles are sent per run; the rest wait for the next one. */
export const MAX_BUNDLES_PER_RUN = 100;

const DAY_MS = 86_400_000;

const RETRY_AFTER_MS = 60_000;

export const EMPTY_BUNDLE: BundleState = {
  lastSentAt: null,
  nextSendAt: null,
  items: [],
  zone: null,
};

const toSafeZone = (zone: string | null): string => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone ?? 'UTC' });
    return zone ?? 'UTC';
  } catch {
    return 'UTC';
  }
};

const isQuietAt = (at: number, zone: string | null) =>
  isQuietHour(getLocalClock(at, zone).hour);

/** The first 08:00 local at or after `from` in the zone; an unknown zone reads as UTC. */
export function getNextMorning(from: number, zone: string | null): number {
  const safeZone = toSafeZone(zone);
  const { date, hour } = getLocalClock(from, safeZone);
  const today = zonedDateTimeToEpoch(
    date,
    `${String(QUIET_UNTIL_HOUR).padStart(2, '0')}:00`,
    safeZone,
  );
  if (hour < QUIET_UNTIL_HOUR) {
    return today;
  }

  const [year, month, day] = date.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day) + DAY_MS)
    .toISOString()
    .slice(0, 10);
  return zonedDateTimeToEpoch(
    tomorrow,
    `${String(QUIET_UNTIL_HOUR).padStart(2, '0')}:00`,
    safeZone,
  );
}

/** When a bundle that has something waiting goes out: after the window since the last push, and not in quiet hours. */
export function getSendTime(
  lastSentAt: number | null,
  now: number,
  zone: string | null,
): number {
  const earliest =
    lastSentAt === null ? now : Math.max(now, lastSentAt + BUNDLE_WINDOW_MS);
  return isQuietAt(earliest, zone) ? getNextMorning(earliest, zone) : earliest;
}

const keepNewest = (items: BundleItem[]) => items.slice(-MAX_BUNDLE_ITEMS);

export type QueueDecision = { sendNow: boolean; next: BundleState };

/** What to do with a new item: send it alone right away when nothing waits, the last push is out of the window and it is not quiet; otherwise add it and let the bundle go when its window ends. */
export function decideQueue(
  stored: BundleState | undefined,
  item: BundleItem,
  zone: string | null,
  now: number,
): QueueDecision {
  const state = stored ?? EMPTY_BUNDLE;
  const isIdle = state.items.length === 0;
  const isWindowOver =
    state.lastSentAt === null || now - state.lastSentAt >= BUNDLE_WINDOW_MS;
  if (isIdle && isWindowOver && !isQuietAt(now, zone)) {
    return {
      sendNow: true,
      next: { ...state, lastSentAt: now, nextSendAt: null, items: [], zone },
    };
  }

  const items = keepNewest([
    ...state.items.filter((waiting) => waiting.key !== item.key),
    item,
  ]);
  const nextSendAt =
    state.nextSendAt ?? getSendTime(state.lastSentAt, now, zone);
  return { sendNow: false, next: { ...state, items, nextSendAt, zone } };
}

/** Whether a stored bundle is due at `now`. */
export const isBundleDue = (state: BundleState, now: number) =>
  state.nextSendAt !== null && state.nextSendAt <= now;

/** What a bundle that is due sends: the items the app still confirms, as one summary, or nothing when none are left. */
export function planDueSend(
  state: BundleState,
  confirmed: BundleItem[],
  summarize: BundleHooks['summarize'],
): PushContent | null {
  if (confirmed.length === 0) {
    return null;
  }

  const isOvernight = confirmed.some((item) =>
    isQuietAt(item.queuedAt, state.zone),
  );
  return summarize(confirmed, { isOvernight });
}

const bundleRef = (firestore: Firestore, appId: string, uid: string) =>
  firestore.doc(`pushBundles/${appId}_${uid}`);

const readBundle = (
  data: Record<string, unknown> | undefined,
): BundleState | undefined =>
  data === undefined
    ? undefined
    : {
        lastSentAt:
          typeof data.lastSentAt === 'number' ? data.lastSentAt : null,
        nextSendAt:
          typeof data.nextSendAt === 'number' ? data.nextSendAt : null,
        items: Array.isArray(data.items) ? (data.items as BundleItem[]) : [],
        zone: typeof data.zone === 'string' ? data.zone : null,
      };

/**
 * The one way an app tells a person that someone is waiting on them: the first goes at once, later ones within 15 minutes go as one,
 * and anything in quiet hours (22:00-08:00 in the zone) goes as one at 08:00. Never dropped. Admin SDK only: no rule matches `pushBundles`.
 * Returns true when the caller's item was sent alone, which this function does itself after the bundle is saved.
 */
export async function queueBundledPush(
  firestore: Firestore,
  messaging: Messaging,
  appId: string,
  uid: string,
  item: BundleItem,
  zone: string | null,
  now: number,
): Promise<boolean> {
  const hooks = Object.hasOwn(BUNDLE_HOOKS, appId) ? BUNDLE_HOOKS[appId] : null;
  const ref = bundleRef(firestore, appId, uid);
  const { sendNow } = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const decision = decideQueue(readBundle(snapshot.data()), item, zone, now);
    transaction.set(ref, { appId, uid, ...decision.next });
    return decision;
  });

  if (sendNow && hooks) {
    await sendPushToUsers(
      firestore,
      messaging,
      [uid],
      hooks.summarize([item], { isOvernight: false }),
    );
  }
  return sendNow;
}

/** Claims one due bundle so overlapping runs send it once, and gives back what it held. */
const claimDueBundle = (
  firestore: Firestore,
  appId: string,
  uid: string,
  now: number,
) =>
  firestore.runTransaction(async (transaction) => {
    const ref = bundleRef(firestore, appId, uid);
    const state = readBundle((await transaction.get(ref)).data());
    if (!state || !isBundleDue(state, now)) {
      return null;
    }

    transaction.set(ref, {
      appId,
      uid,
      ...state,
      lastSentAt: now,
      nextSendAt: null,
      items: [],
    });
    return state;
  });

/** Sends every bundle whose time has come, one summary each. A bundle that fails after being claimed puts its items back for the next run. */
export async function sendDueBundledPushes(
  firestore: Firestore,
  messaging: Messaging,
  now: number,
): Promise<number> {
  const due = await firestore
    .collection('pushBundles')
    .where('nextSendAt', '<=', now)
    .limit(MAX_BUNDLES_PER_RUN)
    .get();

  const results = await Promise.all(
    due.docs.map(async (doc) => {
      const { appId, uid } = doc.data();
      if (typeof appId !== 'string' || typeof uid !== 'string') {
        await doc.ref.delete();
        return false;
      }

      const state = await claimDueBundle(firestore, appId, uid, now);
      if (!state) {
        return false;
      }

      try {
        const hooks = Object.hasOwn(BUNDLE_HOOKS, appId)
          ? BUNDLE_HOOKS[appId]
          : null;
        if (!hooks) {
          logger.warn('Bundled push for an unknown app cleared', { appId });
          return false;
        }

        const confirmed = await hooks.confirmItems(firestore, uid, state.items);
        const content = planDueSend(state, confirmed, hooks.summarize);
        if (content) {
          await sendPushToUsers(firestore, messaging, [uid], content);
        }
        return content !== null;
      } catch (error) {
        logger.error('Bundled push failed; it will be tried again', {
          appId,
          error: error instanceof Error ? error.message : String(error),
        });
        await firestore.runTransaction(async (transaction) => {
          const ref = bundleRef(firestore, appId, uid);
          const current =
            readBundle((await transaction.get(ref)).data()) ?? EMPTY_BUNDLE;
          const items = keepNewest([...state.items, ...current.items]);
          transaction.set(ref, {
            appId,
            uid,
            ...current,
            items,
            nextSendAt: now + RETRY_AFTER_MS,
            zone: state.zone,
          });
        });
        return false;
      }
    }),
  );
  return results.filter(Boolean).length;
}
