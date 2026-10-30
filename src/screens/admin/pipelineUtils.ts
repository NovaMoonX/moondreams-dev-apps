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
  subtitle: string;
  lead: string;
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
  if (age > IDLE_KEEP_MS) return null;
  if (session.state === 'waiting') return 'waiting';
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

function getSubtitle(
  session: PipelineSession,
  group: PipelineGroup | null,
  now: number,
) {
  const time = formatPipelineTime(session.updatedAt, now);
  if (group === 'waiting') {
    const [first = ''] = session.raisedHands.map((line) =>
      stripLinks(line).replace(/^🚩\s*/, ''),
    );
    const asks =
      session.raisedHands.length >= 2
        ? `${session.raisedHands.length} asks · `
        : '';
    return `${time} · ${asks}${first || 'Waiting on you'}`;
  }
  if (group === 'working')
    return `Working since ${formatPipelineTime(session.turnStartedAt ?? session.updatedAt, now)}`;
  if (group === 'quiet') return `No update since ${time}`;
  return `No questions · ${time}`;
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
    return `Finished its turn at ${time} without a question.`;
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
  const group = getSessionGroup(session, now);
  const title = sessionPrs.find((pr) => pr.status?.sessionTitle)?.status
    ?.sessionTitle;
  const branchName = session.branch?.replace(/^claude\//, '');
  return {
    key: session.sessionId,
    name: title || branchName || 'Session',
    url: toHttps(session.url),
    group,
    subtitle: getSubtitle(session, group, now),
    lead: getLead(session, group, safePrs, now),
    raisedHands: session.raisedHands,
    prs: safePrs,
    ownerItems: toSafeItems(
      sessionPrs.flatMap((pr) => pr.status?.ownerItems ?? []),
    ),
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
  return {
    key: `pr-${pr.number}`,
    name: status?.sessionTitle || pr.title,
    url: toHttps(status?.sessionUrl ?? pr.bodySessionUrl),
    group: null,
    subtitle: `${pr.isDraft ? 'Draft' : 'Ready for review'} · ${CI_WORDS[pr.ci]} · #${pr.number}`,
    lead: `Waiting since ${formatPipelineTime(status?.updatedAt ?? 0, now)}${pr.ci === 'red' ? ` · checks failing on #${pr.number}` : ''}`,
    raisedHands: [],
    prs: [safePr],
    ownerItems: toSafeItems(status?.ownerItems ?? []),
    goodToKnow: status?.goodToKnow ?? [],
    screenshots: onlyHttps(status?.screenshots ?? []),
    at: status?.updatedAt ?? 0,
  };
}

/** The sessions grouped for the view, newest first, plus the pull requests that need the owner with no session reporting. */
export function buildPipeline(
  sessions: PipelineSession[],
  inbox: PipelineInbox | null,
  now: number,
) {
  const prs = inbox?.prs ?? [];
  const entries = [...sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((session) => toSessionEntry(session, prs, now));
  const sessionUrls = new Set(
    sessions.flatMap((session) => (session.url === null ? [] : [session.url])),
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
    waiting: inGroup('waiting'),
    working: inGroup('working'),
    quiet: inGroup('quiet'),
    finished: inGroup('finished'),
    prEntries,
  };
}

/** The nav row's sub-line and count, from the same groups the view lists. */
export function getPipelineSummary(
  sessions: PipelineSession[],
  inbox: PipelineInbox | null,
  now: number,
  isLoading: boolean,
  hasError: boolean,
) {
  if (hasError) return { waiting: 0, text: "Couldn't load" };
  if (isLoading) return { waiting: 0, text: 'Loading…' };
  const groups = buildPipeline(sessions, inbox, now);
  const waiting = groups.waiting.length + groups.prEntries.length;
  const working = groups.working.length;
  const parts = [
    ...(waiting > 0 ? [`${waiting} waiting`] : []),
    ...(working > 0 ? [`${working} working`] : []),
  ];
  return {
    waiting,
    text: parts.length > 0 ? parts.join(' · ') : 'Nothing waiting',
  };
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
