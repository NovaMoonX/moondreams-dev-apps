import type {
  PipelineInbox,
  PipelineInboxPr,
  PipelineOwnerItem,
  PipelineSession,
} from '@lib/admin/pipelineTypes';
import { formatDateShort, formatTime } from '@/utils/formatUtils';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
export const QUIET_AFTER_MS = 20 * MINUTE_MS;
export const IDLE_KEEP_MS = 3 * DAY_MS;
export const WAITING_KEEP_MS = 14 * DAY_MS;

export type PipelineGroup = 'waiting' | 'working' | 'quiet' | 'finished';

export const CI_WORDS: Record<PipelineInboxPr['ci'], string> = {
  green: 'checks passing',
  red: 'checks failing',
  running: 'checks running',
  none: 'no checks',
};

export interface PipelinePr extends Omit<PipelineInboxPr, 'url'> {
  url: string | null;
}

export interface PipelineOption {
  label: string;
  images: string[];
}

export interface PipelineOwnerEntryItem {
  text: string;
  options: PipelineOption[];
}

export interface PipelineEntry {
  key: string;
  name: string;
  url: string | null;
  group: PipelineGroup | null;
  /** True for a pull request with no session reporting. */
  isPrOnly: boolean;
  /** When it last reported, in the viewer's time. */
  time: string;
  subtitle: string;
  lead: string;
  /** What it asks of the owner, one plain line each. */
  asks: string[];
  raisedHands: string[];
  prs: PipelinePr[];
  ownerItems: PipelineOwnerEntryItem[];
  goodToKnow: string[];
  screenshots: string[];
  at: number;
}

const toHttps = (url: string | null | undefined) =>
  url?.startsWith('https://') ? url : null;
const onlyHttps = (urls: string[]) =>
  urls.filter((url) => url.startsWith('https://'));

/** "2:14 PM", "Yesterday 6:02 PM" or "Oct 28, 6:02 PM": an instant in the viewer's timezone. */
export function formatPipelineTime(timestamp: number, now: number) {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (timestamp >= startOfToday) return formatTime(timestamp);
  if (timestamp >= startOfToday - DAY_MS)
    return `Yesterday ${formatTime(timestamp)}`;
  return `${formatDateShort(timestamp)}, ${formatTime(timestamp)}`;
}

/** "45 min", "1 h 32 min" or "2 d 3 h". */
function formatSpan(ms: number) {
  const minutes = Math.max(1, Math.floor(ms / MINUTE_MS));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

export function getSessionGroup(
  session: PipelineSession,
  now: number,
): PipelineGroup | null {
  const age = now - session.updatedAt;
  if (session.state === 'waiting')
    return age > WAITING_KEEP_MS ? null : 'waiting';
  if (age > IDLE_KEEP_MS) return null;
  if (session.state === 'working')
    return age >= QUIET_AFTER_MS ? 'quiet' : 'working';
  return 'finished';
}

const getSessionPrs = (session: PipelineSession, prs: PipelineInboxPr[]) =>
  session.url === null
    ? []
    : prs.filter(
        (pr) =>
          pr.status?.sessionUrl === session.url ||
          pr.bodySessionUrl === session.url,
      );

const unique = (lines: string[]) => Array.from(new Set(lines));

const toSafePr = (pr: PipelineInboxPr): PipelinePr => ({
  ...pr,
  url: toHttps(pr.url),
});

const toSafeItems = (items: PipelineOwnerItem[]): PipelineOwnerEntryItem[] =>
  items.map((item) => ({
    text: item.text,
    options: item.options.map((option) => ({
      label: option.label,
      images: onlyHttps(option.images),
    })),
  }));

const toAsk = (line: string) => stripLinks(line).replace(/^🚩\s*/, '');

function getSubtitle(
  group: PipelineGroup | null,
  asks: string[],
  time: string,
  session: PipelineSession,
  now: number,
) {
  if (group === 'waiting') {
    const count = asks.length >= 2 ? `${asks.length} asks · ` : '';
    return `${time} · ${count}${asks[0] || 'Waiting on you'}`;
  }
  if (group === 'working')
    return `Working since ${formatPipelineTime(session.turnStartedAt ?? session.updatedAt, now)}`;
  if (group === 'quiet') return `No update since ${time}`;
  return `Finished at ${time}`;
}

function getLead(
  session: PipelineSession,
  group: PipelineGroup | null,
  prs: PipelinePr[],
  now: number,
) {
  const time = formatPipelineTime(session.updatedAt, now);
  const failing = prs.find((pr) => pr.ci === 'red');
  const base = (() => {
    if (group === 'waiting') return `Waiting since ${time}`;
    if (group === 'working') {
      const since = formatPipelineTime(
        session.turnStartedAt ?? session.updatedAt,
        now,
      );
      return `Working since ${since}${session.branch ? ` on ${session.branch}` : ''}`;
    }
    if (group === 'quiet')
      return `No update for ${formatSpan(now - session.updatedAt)}. It may have stopped, or be waiting on a permission prompt.`;
    return `Finished its turn at ${time}.`;
  })();
  return failing ? `${base} · checks failing on #${failing.number}` : base;
}

function toSessionEntry(
  session: PipelineSession,
  prs: PipelineInboxPr[],
  now: number,
): PipelineEntry {
  const sessionPrs = getSessionPrs(session, prs);
  const safePrs = sessionPrs.map(toSafePr);
  const ownerItems = toSafeItems(
    sessionPrs.flatMap((pr) => pr.status?.ownerItems ?? []),
  );
  const asks =
    ownerItems.length > 0
      ? ownerItems.map((item) => toAsk(item.text))
      : session.raisedHands.map(toAsk);
  const baseGroup = getSessionGroup(session, now);
  // A finished or quiet session that still holds asks is waiting on the owner.
  const group =
    asks.length > 0 && (baseGroup === 'finished' || baseGroup === 'quiet')
      ? 'waiting'
      : baseGroup;
  const time = formatPipelineTime(session.updatedAt, now);
  const title = sessionPrs.find((pr) => pr.status?.sessionTitle)?.status
    ?.sessionTitle;
  const branchName = session.branch?.replace(/^claude\//, '');
  return {
    key: session.sessionId,
    name: title || branchName || 'Session',
    url: toHttps(session.url),
    group,
    isPrOnly: false,
    time,
    subtitle: getSubtitle(group, asks, time, session, now),
    lead: getLead(session, group, safePrs, now),
    asks,
    raisedHands: session.raisedHands,
    prs: safePrs,
    ownerItems,
    goodToKnow: unique(sessionPrs.flatMap((pr) => pr.status?.goodToKnow ?? [])),
    screenshots: onlyHttps(
      unique(sessionPrs.flatMap((pr) => pr.status?.screenshots ?? [])),
    ),
    at: session.updatedAt,
  };
}

function toPrEntry(pr: PipelineInboxPr, now: number): PipelineEntry {
  const status = pr.status;
  const safePr = toSafePr(pr);
  const ownerItems = toSafeItems(status?.ownerItems ?? []);
  const asks = ownerItems.map((item) => toAsk(item.text));
  const time = formatPipelineTime(status?.updatedAt ?? 0, now);
  return {
    key: `pr-${pr.number}`,
    name: status?.sessionTitle || pr.title,
    url: toHttps(status?.sessionUrl ?? pr.bodySessionUrl),
    group: 'waiting',
    isPrOnly: true,
    time,
    subtitle: `${time} · ${asks.length >= 2 ? `${asks.length} asks · ` : ''}${asks[0] || 'Waiting on you'}`,
    lead: `Waiting since ${time}${pr.ci === 'red' ? ` · checks failing on #${pr.number}` : ''}`,
    asks,
    raisedHands: [],
    prs: [safePr],
    ownerItems,
    goodToKnow: status?.goodToKnow ?? [],
    screenshots: onlyHttps(status?.screenshots ?? []),
    at: status?.updatedAt ?? 0,
  };
}

export interface PipelineAction {
  label: string;
  href: string;
}

/** The owner's next steps for an entry: answer in the session, then open its pull request. */
export function getEntryActions(entry: PipelineEntry): PipelineAction[] {
  const prUrl = entry.prs.find((pr) => pr.url !== null)?.url ?? null;
  const answer =
    entry.url && !entry.isPrOnly
      ? [{ label: 'Answer in Claude', href: entry.url }]
      : [];
  const open = prUrl ? [{ label: 'Open the PR', href: prUrl }] : [];
  return [...answer, ...open];
}

export type PipelineGroups = ReturnType<typeof buildPipeline>;

/** The sessions grouped for the view, newest first; waiting also holds the pull requests that need the owner with no session reporting. */
export function buildPipeline(
  sessions: PipelineSession[],
  inbox: PipelineInbox | null,
  now: number,
) {
  const prs = inbox?.prs ?? [];
  const entries = [...sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((session) => toSessionEntry(session, prs, now))
    .filter((entry) => entry.group !== null);
  const sessionUrls = new Set(
    entries.flatMap((entry) => (entry.url === null ? [] : [entry.url])),
  );
  const prEntries = prs
    .filter((pr) => (pr.status?.ownerItems.length ?? 0) > 0)
    .filter(
      (pr) =>
        ![pr.status?.sessionUrl, pr.bodySessionUrl].some(
          (url) => url && sessionUrls.has(url),
        ),
    )
    .map((pr) => toPrEntry(pr, now));
  const inGroup = (group: PipelineGroup) =>
    entries.filter((entry) => entry.group === group);
  return {
    waiting: [...inGroup('waiting'), ...prEntries].sort((a, b) => b.at - a.at),
    working: inGroup('working'),
    quiet: inGroup('quiet'),
    finished: inGroup('finished'),
  };
}

/** The waiting and working counts, from the same groups the view lists. */
export function getPipelineSummary(groups: PipelineGroups) {
  return { waiting: groups.waiting.length, working: groups.working.length };
}

const LINK_SPLIT = /(\[[^\]]*\]\(https:\/\/[^\s)]+\))/;
const LINK_PART = /^\[([^\]]*)\]\((https:\/\/[^\s)]+)\)$/;

export interface TextPart {
  text: string;
  href: string | null;
}

/** Splits text with markdown links into plain pieces and tappable ones; an empty label shows the address. */
export function splitLinks(text: string): TextPart[] {
  return text
    .split(LINK_SPLIT)
    .filter((piece) => piece.length > 0)
    .map((piece) => {
      const link = LINK_PART.exec(piece);
      return link
        ? { text: link[1] || link[2], href: link[2] }
        : { text: piece.replace(/`|\*\*|__/g, ''), href: null };
    });
}

/** The text with its markdown links reduced to their labels, for a one-line clamp that can't hold a link. */
export const stripLinks = (text: string) =>
  splitLinks(text)
    .map((part) => part.text)
    .join('');

/** The muted line for a pipeline that loaded in part, naming what is missing. */
export const getPartialFailureLine = (sessionsFailed: boolean) =>
  `Part of the pipeline couldn't load (${sessionsFailed ? 'sessions' : 'pull requests'}).`;
