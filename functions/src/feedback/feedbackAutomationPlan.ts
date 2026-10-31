// Pure rules for "Let Claude work on feedback by itself", kept free of Firebase so a check can assert them.

export const BATCH_WINDOW_MS = 15 * 60 * 1000;
export const DAILY_SESSION_CAP = 5;
export const MAX_FIRE_FAILURES = 3;
export const CAP_HELD_NOTE = `Today's ${DAILY_SESSION_CAP} automatic sessions are used.`;

export interface QueuedItem {
  id: string;
  kind: string;
  appId: string | null;
  queuedAt: number;
}

/** The items one session will carry. */
export interface SessionBucket {
  items: QueuedItem[];
  firstQueuedAt: number;
}

const addToBuckets = (buckets: SessionBucket[], item: QueuedItem) => {
  const last = buckets.at(-1);
  return last && item.queuedAt - last.firstQueuedAt <= BATCH_WINDOW_MS
    ? [...buckets.slice(0, -1), { ...last, items: [...last.items, item] }]
    : [...buckets, { items: [item], firstQueuedAt: item.queuedAt }];
};

/** Bugs from one app queued within the window of the first share a session; an idea always goes alone; questions never. */
export function bucketQueued(items: QueuedItem[]): SessionBucket[] {
  const sorted = [...items].sort((a, b) => a.queuedAt - b.queuedAt);
  const bugs = sorted.filter((item) => item.kind === 'bug');
  const appIds = [...new Set(bugs.map((bug) => bug.appId))];
  return [
    ...sorted
      .filter((item) => item.kind === 'idea')
      .map((item) => ({ items: [item], firstQueuedAt: item.queuedAt })),
    ...appIds.flatMap((appId) =>
      bugs.filter((bug) => bug.appId === appId).reduce(addToBuckets, []),
    ),
  ].sort((a, b) => a.firstQueuedAt - b.firstQueuedAt);
}

/** A bug bucket waits the whole window after its first item; an idea fires on the next run. */
export const isBucketDue = (bucket: SessionBucket, now: number) =>
  bucket.items[0].kind === 'idea' ||
  now - bucket.firstQueuedAt >= BATCH_WINDOW_MS;

export interface SessionUsage {
  day: string;
  count: number;
}

/** The cap counts per UTC day. */
export const getUtcDay = (now: number) =>
  new Date(now).toISOString().slice(0, 10);

export const getSessionsLeft = (usage: SessionUsage | null, now: number) =>
  usage?.day === getUtcDay(now)
    ? Math.max(0, DAILY_SESSION_CAP - usage.count)
    : DAILY_SESSION_CAP;

export const addSessionToUsage = (
  usage: SessionUsage | null,
  now: number,
): SessionUsage => ({
  day: getUtcDay(now),
  count: (usage?.day === getUtcDay(now) ? usage.count : 0) + 1,
});

/** Adds one failed fire to each item; those that reached the limit are to be held. */
export function registerFailure(
  failures: Record<string, number>,
  ids: string[],
): { failures: Record<string, number>; heldIds: string[] } {
  const next = {
    ...failures,
    ...Object.fromEntries(ids.map((id) => [id, (failures[id] ?? 0) + 1])),
  };
  return {
    failures: next,
    heldIds: ids.filter((id) => next[id] >= MAX_FIRE_FAILURES),
  };
}

export type AgentState =
  'queued' | 'working' | 'pr-ready' | 'needs-you' | 'held' | 'merged';

export interface PrReport {
  url: string;
  needsOwner: boolean;
  isMerged: boolean;
}

export interface PrStateUpdate {
  agentState: AgentState;
  agentPrUrl: string;
  /** Raise the admin's bell: the PR now waits on them. */
  isUnreadByAdmin: boolean;
  /** Tell the sender it is done (unless the admin already closed it). */
  isDone: boolean;
}

const TRACKED: (string | null)[] = ['working', 'pr-ready', 'needs-you'];

/** What a PR's state changes on an item an automatic session works on, or null when nothing changes (so a re-report never re-flags the bell). */
export function getPrStateUpdate(
  item: {
    agentState: string | null;
    agentPrUrl: string | null;
    status: string;
  },
  pr: PrReport,
): PrStateUpdate | null {
  if (!TRACKED.includes(item.agentState)) return null;
  const agentState: AgentState = pr.isMerged
    ? 'merged'
    : pr.needsOwner
      ? 'needs-you'
      : 'pr-ready';
  if (agentState === item.agentState && pr.url === item.agentPrUrl) return null;
  return {
    agentState,
    agentPrUrl: pr.url,
    isUnreadByAdmin:
      agentState === 'needs-you' && item.agentState !== agentState,
    isDone:
      agentState === 'merged' &&
      item.status !== 'done' &&
      item.status !== 'wont-do',
  };
}
