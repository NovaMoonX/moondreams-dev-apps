import type {
  PipelineGalleryImage,
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

export interface PipelinePr extends Omit<PipelineInboxPr, 'url'> {
  url: string | null;
}

export interface PipelineOption {
  label: string;
  images: string[];
  isRecommended: boolean;
}

export interface PipelineOwnerEntryItem {
  /** The pull request it was raised on and its place in that pull request's list. */
  id: string;
  prNumber: number;
  /** When that pull request's status last changed: an answer sent before this has been read. */
  statusAt: number;
  text: string;
  options: PipelineOption[];
  isMulti: boolean;
}

export interface GalleryItem {
  id: string;
  step: number | null;
  label: string;
  shots: PipelineGalleryImage[];
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
  gallery: GalleryItem[];
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

const RECOMMENDED = /\s*\(recommended\)/i;

const toSafeItems = (prs: PipelineInboxPr[]): PipelineOwnerEntryItem[] =>
  prs.flatMap((pr) =>
    (pr.status?.ownerItems ?? []).map((item: PipelineOwnerItem, index) => ({
      id: `${pr.number}:${index}`,
      prNumber: pr.number,
      statusAt: pr.status?.updatedAt ?? 0,
      text: item.text,
      options: item.options.map((option) => ({
        label: option.label.replace(RECOMMENDED, '').trim(),
        images: onlyHttps(option.images),
        isRecommended: RECOMMENDED.test(option.label),
      })),
      isMulti: item.isMulti === true,
    })),
  );

// "2 · Pick a day", "2. Pick a day", "2) …", "2: …" or "2 - …"; never "3-day trip" or "1.5x zoom".
const STEP_LABEL = /^(\d+)(?:\s*·\s*|[.):]\s+|\s+[–—-]\s+)(.+)$/;

const toGalleryItems = (prs: PipelineInboxPr[]): GalleryItem[] =>
  prs.flatMap((pr) => {
    const steps = (pr.gallery ?? []).flatMap((step, index) => {
      const shots = step.images.filter((image) =>
        image.src.startsWith('https://'),
      );
      const numbered = STEP_LABEL.exec(step.label);
      return shots.length === 0
        ? []
        : [
            {
              id: `${pr.number}:${index}`,
              step: numbered ? Number(numbered[1]) : null,
              label: numbered ? numbered[2] : step.label,
              shots,
            },
          ];
    });
    if (steps.length > 0) return steps;
    return onlyHttps(pr.status?.screenshots ?? []).map((src, index) => ({
      id: `${pr.number}:status-${index}`,
      step: null,
      label: 'Screenshot',
      shots: [{ src, role: null }],
    }));
  });

const toSentence = (text: string) =>
  text.trim().replace(/^./, (first) => first.toUpperCase());

/** "claude/runway-cards" as "Runway cards". */
const toBranchWords = (branch: string | null) =>
  branch
    ? toSentence(branch.replace(/^claude\//, '').replace(/[-_/]+/g, ' '))
    : '';

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
  now: number,
) {
  const time = formatPipelineTime(session.updatedAt, now);
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
}

function toSessionEntry(
  session: PipelineSession,
  prs: PipelineInboxPr[],
  now: number,
): PipelineEntry {
  const sessionPrs = getSessionPrs(session, prs);
  const safePrs = sessionPrs.map(toSafePr);
  const ownerItems = toSafeItems(sessionPrs);
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
  return {
    key: session.sessionId,
    name:
      toSentence(title || sessionPrs[0]?.title || '') ||
      toBranchWords(session.branch) ||
      'Session',
    url: toHttps(session.url),
    group,
    isPrOnly: false,
    time,
    subtitle: getSubtitle(group, asks, time, session, now),
    lead: getLead(session, group, now),
    asks,
    raisedHands: session.raisedHands,
    prs: safePrs,
    ownerItems,
    goodToKnow: unique(sessionPrs.flatMap((pr) => pr.status?.goodToKnow ?? [])),
    gallery: toGalleryItems(sessionPrs),
    at: session.updatedAt,
  };
}

function toPrEntry(pr: PipelineInboxPr, now: number): PipelineEntry {
  const status = pr.status;
  const safePr = toSafePr(pr);
  const ownerItems = toSafeItems([pr]);
  const asks = ownerItems.map((item) => toAsk(item.text));
  const time = formatPipelineTime(status?.updatedAt ?? 0, now);
  return {
    key: `pr-${pr.number}`,
    name: toSentence(status?.sessionTitle || pr.title),
    url: toHttps(status?.sessionUrl ?? pr.bodySessionUrl),
    group: 'waiting',
    isPrOnly: true,
    time,
    subtitle: `${time} · ${asks.length >= 2 ? `${asks.length} asks · ` : ''}${asks[0] || 'Waiting on you'}`,
    lead: `Waiting since ${time}`,
    asks,
    raisedHands: [],
    prs: [safePr],
    ownerItems,
    goodToKnow: status?.goodToKnow ?? [],
    gallery: toGalleryItems([pr]),
    at: status?.updatedAt ?? 0,
  };
}

// A reply answers 🚩 lines when no question was asked; feedback sits beside the questions, tied to none.
export type AnswerSlotKind = 'question' | 'reply' | 'feedback';

export interface AnswerSlot {
  id: string;
  prNumber: number;
  statusAt: number;
  /** Plain text, as it is sent. */
  question: string;
  /** The question as the owner reads it, links and all. */
  text: string;
  options: PipelineOption[];
  isMulti: boolean;
  kind: AnswerSlotKind;
}

/** What the owner can answer on an entry: each question plus one box for anything else, or one reply when only 🚩 lines were raised. */
export function getAnswerSlots(entry: PipelineEntry): AnswerSlot[] {
  const [pr] = entry.prs;
  const toFreeSlot = (
    target: PipelinePr,
    kind: AnswerSlotKind,
  ): AnswerSlot => ({
    id: `${entry.key}:${target.number}:${kind}`,
    prNumber: target.number,
    statusAt: target.status?.updatedAt ?? 0,
    question: kind === 'reply' ? 'Reply to what was raised' : 'Anything else',
    text: kind === 'reply' ? `Reply on #${target.number}` : 'Anything else?',
    options: [],
    isMulti: false,
    kind,
  });
  if (entry.ownerItems.length > 0) {
    const questions = entry.ownerItems.map(
      (item): AnswerSlot => ({
        id: item.id,
        prNumber: item.prNumber,
        statusAt: item.statusAt,
        question: stripLinks(item.text).slice(0, 500),
        text: item.text,
        options: item.options,
        isMulti: item.isMulti,
        kind: 'question',
      }),
    );
    const target =
      entry.prs.find((candidate) => candidate.number === questions[0].prNumber) ??
      pr;
    return target ? [...questions, toFreeSlot(target, 'feedback')] : questions;
  }
  if (!pr || entry.raisedHands.length === 0) return [];
  return [toFreeSlot(pr, 'reply')];
}

/** The slots that ask something of the owner, without the optional feedback box. */
export const getAskedSlots = (slots: AnswerSlot[]) =>
  slots.filter((slot) => slot.kind !== 'feedback');

/** A pull request's failure goes under its last question only, once (the feedback box when it asked none). */
export const getPrError = (
  slots: AnswerSlot[],
  slot: AnswerSlot,
  errors: Record<number, string>,
) => {
  const onPr = slots.filter((other) => other.prNumber === slot.prNumber);
  const asked = getAskedSlots(onPr);
  return (asked.length > 0 ? asked : onPr).at(-1) === slot
    ? (errors[slot.prNumber] ?? null)
    : null;
};

export interface PipelineAction {
  label: string;
  href: string;
}

/** The session to answer in, when the entry has one. */
export function getEntryActions(entry: PipelineEntry): PipelineAction[] {
  return entry.url && !entry.isPrOnly
    ? [{ label: 'Answer in Claude', href: entry.url }]
    : [];
}

export const getEntryPrUrl = (entry: PipelineEntry) =>
  entry.prs.find((pr) => pr.url !== null)?.url ?? null;

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
