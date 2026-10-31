// Pure rules for "Let Claude work on feedback by itself", kept free of Firebase so a check can assert them.

export const BATCH_WINDOW_MS = 15 * 60 * 1000;
export const DAILY_SESSION_CAP = 5;
export const MAX_FIRE_FAILURES = 3;
export const CAP_HELD_NOTE = `Today's ${DAILY_SESSION_CAP} automatic sessions are used.`;
export const NOT_CONNECTED_NOTE = "Claude isn't connected";
export const STARTING_STALE_MS = 10 * 60 * 1000;
export const STUCK_HELD_NOTE =
  'A session may have started; check Claude before sending again';
export const PR_CLOSED_NOTE = 'Its PR was closed without merging';
/** A run stops starting new sessions after this long, well inside the function's own timeout. */
export const RUN_BUDGET_MS = 200_000;
/** Fire attempts one run may make: what is left of the day's cap, plus a couple of spare for failures. */
export const getMaxFireAttempts = (sessionsLeft: number) => sessionsLeft + 2;

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

/** The usage document: the day's count, the failed fires per item, and when each `starting` item was claimed. */
export interface UsageDoc {
  usage: SessionUsage | null;
  failures: Record<string, number>;
  claims: Record<string, number>;
}

const toNumberMap = (value: unknown): Record<string, number> =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number',
        ),
      )
    : {};

export function readUsageDoc(
  data: Record<string, unknown> | undefined,
): UsageDoc {
  return {
    usage:
      typeof data?.day === 'string' && typeof data.count === 'number'
        ? { day: data.day, count: data.count }
        : null,
    failures: toNumberMap(data?.failures),
    claims: toNumberMap(data?.claims),
  };
}

export const toUsageData = (doc: UsageDoc) => ({
  ...(doc.usage ?? { day: '', count: 0 }),
  failures: doc.failures,
  claims: doc.claims,
});

export const omitIds = (map: Record<string, number>, ids: string[]) =>
  Object.fromEntries(Object.entries(map).filter(([id]) => !ids.includes(id)));

/** Whether a queued item is still worth a session when its turn comes: still queued, a bug or an idea that is still Planned, and not closed. */
export const isClaimable = (
  item: { agentState: string | null; kind: string; status: string } | null,
) =>
  item !== null &&
  item.agentState === 'queued' &&
  (item.kind === 'bug' ||
    (item.kind === 'idea' && item.status === 'planned')) &&
  item.status !== 'done' &&
  item.status !== 'wont-do';

/** An item left in `starting` past the window, or with no claim on record, may have a session behind it: it is held, never fired again. */
export const isStuckStarting = (claimedAt: number | undefined, now: number) =>
  claimedAt === undefined || now - claimedAt > STARTING_STALE_MS;

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
  | 'queued'
  | 'starting'
  | 'working'
  | 'pr-ready'
  | 'needs-you'
  | 'held'
  | 'merged';

export interface PrReport {
  url: string;
  needsOwner: boolean;
  isMerged: boolean;
  /** Closed without merging. */
  isClosed: boolean;
}

export interface PrStateUpdate {
  agentState: AgentState;
  agentPrUrl: string;
  agentNote: string | null;
  /** Raise the admin's bell: the PR now waits on them. */
  isUnreadByAdmin: boolean;
  /** Tell the sender it is done (unless the admin already closed it). */
  isDone: boolean;
}

const TRACKED: (string | null)[] = ['working', 'pr-ready', 'needs-you'];

/** What a PR's state changes on an item an automatic session works on, or null when nothing changes (so a re-report never re-flags the bell). Once an item has a PR, only that PR's reports change it. */
export function getPrStateUpdate(
  item: {
    agentState: string | null;
    agentPrUrl: string | null;
    agentNote: string | null;
    status: string;
  },
  pr: PrReport,
): PrStateUpdate | null {
  if (!TRACKED.includes(item.agentState)) return null;
  if (item.agentPrUrl !== null && item.agentPrUrl !== pr.url) return null;
  const agentState: AgentState = pr.isMerged
    ? 'merged'
    : pr.isClosed || pr.needsOwner
      ? 'needs-you'
      : 'pr-ready';
  const agentNote = !pr.isMerged && pr.isClosed ? PR_CLOSED_NOTE : null;
  if (
    agentState === item.agentState &&
    pr.url === item.agentPrUrl &&
    agentNote === item.agentNote
  ) {
    return null;
  }
  return {
    agentState,
    agentPrUrl: pr.url,
    agentNote,
    isUnreadByAdmin:
      agentState === 'needs-you' && item.agentState !== agentState,
    isDone:
      agentState === 'merged' &&
      item.status !== 'done' &&
      item.status !== 'wont-do',
  };
}
