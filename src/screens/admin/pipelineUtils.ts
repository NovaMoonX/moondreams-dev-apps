import type {
  PipelineInbox,
  PipelineInboxPr,
  PipelineOwnerItem,
  PipelineSession,
} from '@lib/admin/pipelineTypes';
import { formatDateShort, formatTime } from '@/utils/formatUtils';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
export const QUIET_AFTER_MS = 20 * MINUTE_MS;
export const IDLE_KEEP_MS = 3 * DAY_MS;

export type PipelineGroup = 'waiting' | 'working' | 'quiet' | 'idle';

export interface PipelineEntry {
  key: string;
  name: string;
  url: string | null;
  group: PipelineGroup | null;
  subtitle: string;
  raisedHands: string[];
  prs: PipelineInboxPr[];
  ownerItems: PipelineOwnerItem[];
  goodToKnow: string[];
  screenshots: string[];
  at: number;
}

/** "2:14 PM", "Yesterday 6:02 PM" or "Oct 28, 6:02 PM": an instant in the viewer's timezone. */
export function formatPipelineTime(timestamp: number, now: number) {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (timestamp >= startOfToday) return formatTime(timestamp);
  if (timestamp >= startOfToday - DAY_MS)
    return `Yesterday ${formatTime(timestamp)}`;
  return `${formatDateShort(timestamp)}, ${formatTime(timestamp)}`;
}

export function getSessionGroup(
  session: PipelineSession,
  now: number,
): PipelineGroup | null {
  if (session.state === 'waiting')
    return now - session.updatedAt <= IDLE_KEEP_MS ? 'waiting' : null;
  if (session.state === 'working')
    return now - session.updatedAt >= QUIET_AFTER_MS ? 'quiet' : 'working';
  return now - session.updatedAt <= IDLE_KEEP_MS ? 'idle' : null;
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

function getSubtitle(
  session: PipelineSession,
  group: PipelineGroup | null,
  now: number,
) {
  const time = formatPipelineTime(session.updatedAt, now);
  if (group === 'waiting') {
    const raised = stripLinks(session.raisedHands[0] ?? '').replace(
      /^🚩\s*/,
      '',
    );
    return raised ? `${raised} · ${time}` : `Waiting on you · ${time}`;
  }
  if (group === 'working')
    return `Working since ${formatPipelineTime(session.turnStartedAt ?? session.updatedAt, now)}`;
  if (group === 'quiet') return `Quiet since ${time}`;
  return `Finished its turn at ${time}`;
}

function toSessionEntry(
  session: PipelineSession,
  prs: PipelineInboxPr[],
  now: number,
): PipelineEntry {
  const sessionPrs = getSessionPrs(session, prs);
  const group = getSessionGroup(session, now);
  const title = sessionPrs.find((pr) => pr.status?.sessionTitle)?.status
    ?.sessionTitle;
  const branchName = session.branch?.replace(/^claude\//, '');
  return {
    key: session.sessionId,
    name: title || branchName || 'Session',
    url: session.url,
    group,
    subtitle: getSubtitle(session, group, now),
    raisedHands: session.raisedHands,
    prs: sessionPrs,
    ownerItems: sessionPrs.flatMap((pr) => pr.status?.ownerItems ?? []),
    goodToKnow: unique(sessionPrs.flatMap((pr) => pr.status?.goodToKnow ?? [])),
    screenshots: unique(
      sessionPrs.flatMap((pr) => pr.status?.screenshots ?? []),
    ),
    at: session.updatedAt,
  };
}

function toPrEntry(pr: PipelineInboxPr, now: number): PipelineEntry {
  const status = pr.status;
  return {
    key: `pr-${pr.number}`,
    name: status?.sessionTitle || pr.title,
    url: status?.sessionUrl ?? pr.bodySessionUrl,
    group: null,
    subtitle: `${pr.title} · #${pr.number}${status ? ` · ${formatPipelineTime(status.updatedAt, now)}` : ''}`,
    raisedHands: [],
    prs: [pr],
    ownerItems: status?.ownerItems ?? [],
    goodToKnow: status?.goodToKnow ?? [],
    screenshots: status?.screenshots ?? [],
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
    idle: inGroup('idle'),
    prEntries,
  };
}

/** The nav row's sub-line and count, read straight from the sessions. */
export function getPipelineSummary(sessions: PipelineSession[], now: number) {
  const groups = sessions.map((session) => getSessionGroup(session, now));
  const waiting = groups.filter((group) => group === 'waiting').length;
  const working = groups.filter((group) => group === 'working').length;
  const parts = [
    waiting > 0 ? `${waiting} waiting on you` : 'Nothing waiting on you',
    ...(working > 0 ? [`${working} working`] : []),
  ];
  return { waiting, text: parts.join(' · ') };
}

const LINK_SPLIT = /(\[[^\]]*\]\(https?:\/\/[^\s)]+\))/;
const LINK_PART = /^\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/;

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
