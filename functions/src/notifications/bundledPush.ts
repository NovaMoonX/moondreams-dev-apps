import type { Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';

import { goingOnceBundleHooks } from '../apps/going-once/bundleHooks.js';
import { getLocalClock } from './localClock.js';
import { QUIET_UNTIL_HOUR, isQuietHour } from './pushBudget.js';
import { sendPushReport, type PushContent } from './sendPush.js';
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
  /** Tries made at the items now being sent; reset when a send is acknowledged. */
  attempts: number;
  /** While set and in the future, a run has claimed `sending` and is sending it. */
  sendingUntil: number | null;
  /** The items a claim is sending; they stay in `items` until the send is acknowledged. */
  sending: BundleItem[];
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

/** How long a claimed bundle is left alone before another run may send it again. */
export const LEASE_MS = 3 * 60_000;

/** Tries at one bundle before it is given up on. */
export const MAX_ATTEMPTS = 5;

export const EMPTY_BUNDLE: BundleState = {
  lastSentAt: null,
  nextSendAt: null,
  items: [],
  zone: null,
  attempts: 0,
  sendingUntil: null,
  sending: [],
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

const readItems = (value: unknown) =>
  Array.isArray(value) ? (value as BundleItem[]) : [];

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
        items: readItems(data.items),
        zone: typeof data.zone === 'string' ? data.zone : null,
        attempts: typeof data.attempts === 'number' ? data.attempts : 0,
        sendingUntil:
          typeof data.sendingUntil === 'number' ? data.sendingUntil : null,
        sending: readItems(data.sending),
      };

const isSameItem = (first: BundleItem, second: BundleItem) =>
  first.key === second.key && first.queuedAt === second.queuedAt;

export type Claim =
  | { kind: 'skip' }
  | { kind: 'give-up'; next: BundleState }
  | { kind: 'send'; next: BundleState; sending: BundleItem[] };

/** Takes a due bundle for sending without emptying it: the items stay and a lease keeps other runs off until it ends, so a crash leaves them to be claimed again. After MAX_ATTEMPTS the items are given up on. */
export function claimDue(state: BundleState, now: number): Claim {
  if (!isBundleDue(state, now)) {
    return { kind: 'skip' };
  }

  if (state.attempts >= MAX_ATTEMPTS) {
    return {
      kind: 'give-up',
      next: {
        ...state,
        items: [],
        nextSendAt: null,
        attempts: 0,
        sendingUntil: null,
        sending: [],
      },
    };
  }

  return {
    kind: 'send',
    sending: state.items,
    next: {
      ...state,
      attempts: state.attempts + 1,
      sendingUntil: now + LEASE_MS,
      nextSendAt: now + LEASE_MS,
      sending: state.items,
    },
  };
}

/** The bundle after its claimed items were handled: they leave, `lastSentAt` moves only when a push really went out, and what came in meanwhile waits for its own window. */
export function settleSent(
  current: BundleState,
  sent: BundleItem[],
  now: number,
  didSend: boolean,
): BundleState {
  const items = current.items.filter(
    (item) => !sent.some((handled) => isSameItem(handled, item)),
  );
  const lastSentAt = didSend ? now : current.lastSentAt;
  return {
    ...current,
    lastSentAt,
    items,
    nextSendAt:
      items.length > 0 ? getSendTime(lastSentAt, now, current.zone) : null,
    attempts: 0,
    sendingUntil: null,
    sending: [],
  };
}

/** The bundle after a failed send: every item stays, and the next try is a minute on, moved out of quiet hours. */
export const planRetry = (current: BundleState, now: number): BundleState => ({
  ...current,
  nextSendAt: getSendTime(
    current.lastSentAt,
    now + RETRY_AFTER_MS,
    current.zone,
  ),
  sendingUntil: null,
  sending: [],
});

/** The bundle after an immediate send failed: the item goes back as queued, deduped by key, the window it claimed is given back, and it is tried again at a time outside quiet hours. */
export function putBackQueued(
  current: BundleState,
  item: BundleItem,
  claimedAt: number,
  previousLastSentAt: number | null,
  now: number,
  zone: string | null,
): BundleState {
  const lastSentAt =
    current.lastSentAt === claimedAt ? previousLastSentAt : current.lastSentAt;
  return {
    ...current,
    lastSentAt,
    items: keepNewest([
      ...current.items.filter((waiting) => waiting.key !== item.key),
      item,
    ]),
    nextSendAt:
      current.nextSendAt ??
      getSendTime(lastSentAt, now + RETRY_AFTER_MS, current.zone ?? zone),
    zone: current.zone ?? zone,
  };
}

/**
 * The one way an app tells a person that someone is waiting on them: the first goes at once, later ones within 15 minutes go as one,
 * and anything in quiet hours (22:00-08:00 in the zone) goes as one at 08:00. Never dropped: an item stays until its send is acknowledged. Admin SDK only: no rule matches `pushBundles`.
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
  const { sendNow, previousLastSentAt } = await firestore.runTransaction(
    async (transaction) => {
      const snapshot = await transaction.get(ref);
      const stored = readBundle(snapshot.data());
      const decision = decideQueue(stored, item, zone, now);
      transaction.set(ref, { appId, uid, ...decision.next });
      return {
        sendNow: decision.sendNow,
        previousLastSentAt: stored?.lastSentAt ?? null,
      };
    },
  );

  if (sendNow && hooks) {
    try {
      const report = await sendPushReport(
        firestore,
        messaging,
        [uid],
        hooks.summarize([item], { isOvernight: false }),
      );
      if (report.isFailure) {
        throw new Error('Every device failed');
      }
    } catch (error) {
      logger.error('Immediate push failed; queued to try again', {
        appId,
        error: error instanceof Error ? error.message : String(error),
      });
      await firestore.runTransaction(async (transaction) => {
        const current =
          readBundle((await transaction.get(ref)).data()) ?? EMPTY_BUNDLE;
        transaction.set(ref, {
          appId,
          uid,
          ...putBackQueued(current, item, now, previousLastSentAt, now, zone),
        });
      });
    }
  }
  return sendNow;
}

/** Claims one due bundle with a lease so overlapping runs send it once, and gives back what it holds. */
const claimDueBundle = (
  firestore: Firestore,
  appId: string,
  uid: string,
  now: number,
) =>
  firestore.runTransaction(async (transaction) => {
    const ref = bundleRef(firestore, appId, uid);
    const state = readBundle((await transaction.get(ref)).data());
    if (!state) {
      return null;
    }

    const claim = claimDue(state, now);
    if (claim.kind === 'skip') {
      return null;
    }

    transaction.set(ref, { appId, uid, ...claim.next });
    if (claim.kind === 'give-up') {
      logger.error('Bundled push given up after repeated failures', {
        appId,
        items: state.items.length,
      });
      return null;
    }

    return { state: claim.next, sending: claim.sending };
  });

const updateBundle = (
  firestore: Firestore,
  appId: string,
  uid: string,
  update: (current: BundleState) => BundleState,
) =>
  firestore.runTransaction(async (transaction) => {
    const ref = bundleRef(firestore, appId, uid);
    const current =
      readBundle((await transaction.get(ref)).data()) ?? EMPTY_BUNDLE;
    transaction.set(ref, { appId, uid, ...update(current) });
  });

/** Sends every bundle whose time has come, one summary each. A bundle keeps its items until the send is acknowledged; one that fails is tried again a minute on (never in quiet hours), up to MAX_ATTEMPTS. */
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

      const claimed = await claimDueBundle(firestore, appId, uid, now);
      if (!claimed) {
        return false;
      }

      try {
        const hooks = Object.hasOwn(BUNDLE_HOOKS, appId)
          ? BUNDLE_HOOKS[appId]
          : null;
        if (!hooks) {
          logger.warn('Bundled push for an unknown app cleared', { appId });
          await updateBundle(firestore, appId, uid, (current) =>
            settleSent(current, claimed.sending, now, false),
          );
          return false;
        }

        const confirmed = await hooks.confirmItems(
          firestore,
          uid,
          claimed.sending,
        );
        const content = planDueSend(claimed.state, confirmed, hooks.summarize);
        if (content) {
          const report = await sendPushReport(
            firestore,
            messaging,
            [uid],
            content,
          );
          if (report.isFailure) {
            throw new Error('Every device failed');
          }
        }
        await updateBundle(firestore, appId, uid, (current) =>
          settleSent(current, claimed.sending, now, content !== null),
        );
        return content !== null;
      } catch (error) {
        logger.error('Bundled push failed; it will be tried again', {
          appId,
          attempts: claimed.state.attempts,
          error: error instanceof Error ? error.message : String(error),
        });
        await updateBundle(firestore, appId, uid, (current) =>
          planRetry(current, now),
        );
        return false;
      }
    }),
  );
  return results.filter(Boolean).length;
}
