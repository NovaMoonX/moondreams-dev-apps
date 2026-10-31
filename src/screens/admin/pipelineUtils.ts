import type {
  PipelineGalleryImage,
  PipelineInbox,
  PipelineInboxPr,
  PipelineMergedPr,
  PipelineOwnerItem,
  PipelinePhase,
  PipelineSession,
  PipelineSettledAsk,
  PipelineSettleOutcome,
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
  isTask: boolean;
  /** Ticked off or set aside from the dashboard since the status that listed it. */
  settled: PipelineSettleOutcome | null;
}

/** A call a session made for the owner, listed under its pull request's "Decisions I made for you". */
export interface PipelineDecision {
  /** The pull request it was listed on and its place in that list: "<pr>:d<index>". */
  id: string;
  prNumber: number;
  /** When that pull request's status last changed: an answer sent before this has been read. */
  statusAt: number;
  text: string;
}

/** A 🚩 line from a session's last reply. */
export interface PipelineHand {
  text: string;
  /** No question mark: something to do, ticked off rather than answered. */
  isTask: boolean;
  settled: PipelineSettleOutcome | null;
}

/** Which ask to tick off or set aside: a status comment's line, or a 🚩 line a session raised. */
export interface SettleTarget {
  prNumber: number | null;
  sessionId: string | null;
  text: string;
}

/** A settled ask as the dashboard holds it: an Undo not yet reflected everywhere is `open`. */
export type SettledAskView = Omit<PipelineSettledAsk, 'outcome'> & {
  outcome: PipelineSettleOutcome | 'open';
};

export const toSettleId = (target: SettleTarget) =>
  `${target.prNumber ?? target.sessionId}:${target.text}`;

export interface GalleryItem {
  id: string;
  step: number | null;
  label: string;
  note: string | null;
  shots: PipelineGalleryImage[];
}

export interface PipelineEntry {
  key: string;
  name: string;
  url: string | null;
  group: PipelineGroup | null;
  /** True for a pull request with no session reporting. */
  isPrOnly: boolean;
  /** Its session's last report is recent enough for the server to ask it to merge rather than merge itself. */
  isDriven: boolean;
  /** When it last reported, in the viewer's time. */
  time: string;
  subtitle: string;
  lead: string;
  /** What it asks of the owner and isn't settled yet, one plain line each. */
  asks: string[];
  /** The session's id when the entry is a session, for settling its 🚩 lines. */
  sessionId: string | null;
  hands: PipelineHand[];
  prs: PipelinePr[];
  ownerItems: PipelineOwnerEntryItem[];
  goodToKnow: string[];
  /** The calls made for the owner that they haven't answered from the dashboard since the status that listed them. Never a reason to wait or to hold a merge. */
  decisions: PipelineDecision[];
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

/** The asks the owner hasn't answered from the dashboard since the status that raised them; settled ones stay, to show with their Undo. */
const getOpenItems = (
  items: PipelineOwnerEntryItem[],
  answered: Record<string, number>,
) =>
  items.filter((item) => (answered[item.id] ?? 0) < item.statusAt);

const RECOMMENDED = /\s*\(recommended\)/i;

// A status line settled before the session's next status rewrite stays settled; after it, the rewrite (which keeps the owner's ticks) is what counts.
const getItemSettled = (
  settled: SettledAskView[],
  prNumber: number,
  item: PipelineOwnerItem,
  statusAt: number,
) => {
  const ask = settled.find(
    (candidate) =>
      candidate.prNumber === prNumber &&
      candidate.text === item.text &&
      candidate.at >= statusAt,
  );
  if (ask) return ask.outcome === 'open' ? null : ask.outcome;
  return item.settled ?? null;
};

const HELD_FOR_MS = 6 * HOUR_MS;

// Its session writes "in progress" until the review sized to the PR is back; its questions wait for that,
// but only for a few hours, so a session that stopped can't hide them for good.
const isReady = (pr: PipelineInboxPr, now: number) =>
  !/^in progress\b/i.test(pr.status?.state ?? '') ||
  now - (pr.status?.updatedAt ?? 0) > HELD_FOR_MS;

const toSafeItems = (
  prs: PipelineInboxPr[],
  settled: SettledAskView[],
  now: number,
): PipelineOwnerEntryItem[] =>
  prs.filter((pr) => isReady(pr, now)).flatMap((pr) =>
    (pr.status?.ownerItems ?? []).map((item: PipelineOwnerItem, index) => {
      const statusAt = pr.status?.updatedAt ?? 0;
      return {
        id: `${pr.number}:${index}`,
        prNumber: pr.number,
        statusAt,
        text: item.text,
        options: item.options.map((option) => ({
          label: option.label.replace(RECOMMENDED, '').trim(),
          images: onlyHttps(option.images),
          isRecommended: RECOMMENDED.test(option.label),
        })),
        isMulti: item.isMulti === true,
        isTask: item.isTask === true,
        settled: getItemSettled(settled, pr.number, item, statusAt),
      };
    }),
  );

const toOpenDecisions = (
  prs: PipelineInboxPr[],
  answered: Record<string, number>,
  now: number,
): PipelineDecision[] =>
  prs
    .filter((pr) => isReady(pr, now))
    .flatMap((pr) => {
      const statusAt = pr.status?.updatedAt ?? 0;
      if ((answered[`${pr.number}:decisions`] ?? 0) >= statusAt) return [];
      return (pr.status?.decisions ?? []).map((text, index) => ({
        id: `${pr.number}:d${index}`,
        prNumber: pr.number,
        statusAt,
        text,
      }));
    });

const toDecisionWords = (count: number) =>
  `${count} ${count === 1 ? 'decision' : 'decisions'} made for you`;

const withDecisions = (subtitle: string, decisions: PipelineDecision[]) =>
  decisions.length > 0
    ? `${subtitle} · ${toDecisionWords(decisions.length)}`
    : subtitle;

const isOpenAsk = (ask: { settled: PipelineSettleOutcome | null }) =>
  ask.settled === null;

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
              note: step.note ?? null,
              shots,
            },
          ];
    });
    if (steps.length > 0) return steps;
    return onlyHttps(pr.status?.screenshots ?? []).map((src, index) => ({
      id: `${pr.number}:status-${index}`,
      step: null,
      label: 'Screenshot',
      note: null,
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

const ANSWERED_LINE = 'Answered · waiting for the session';

const PHASE_WORDS: Record<PipelinePhase, string> = {
  planning: 'Planning',
  building: 'Building',
  investigating: 'Reading the code',
  screenshots: 'Taking screenshots',
  review: 'Reviewing',
  checks: 'Running checks',
  conversation: 'Writing to GitHub',
};

/** "Reviewing · technical reviewer, validator": what a working session is doing, or null when it hasn't said. */
export function getActivity(session: PipelineSession) {
  const phase = session.phase ? PHASE_WORDS[session.phase] : null;
  const helpers = Array.from(new Set(session.helpers ?? [])).map((helper) =>
    helper.replace(/[-_]+/g, ' '),
  );
  const helperWords = helpers.length > 0 ? helpers.join(', ') : null;
  if (phase && helperWords) return `${phase} · ${helperWords}`;
  return phase ?? (helperWords ? `Helpers out: ${helperWords}` : null);
}

function getSubtitle(
  group: PipelineGroup | null,
  asks: string[],
  time: string,
  session: PipelineSession,
  now: number,
  isAnswered: boolean,
) {
  if (isAnswered && group !== 'working') return `${time} · You answered`;
  if (group === 'waiting') {
    const count = asks.length >= 2 ? `${asks.length} asks · ` : '';
    return `${time} · ${count}${asks[0] || 'Waiting on you'}`;
  }
  if (group === 'working') {
    const since = `since ${formatPipelineTime(session.turnStartedAt ?? session.updatedAt, now)}`;
    const activity = getActivity(session);
    return activity ? `${activity} · ${since}` : `Working ${since}`;
  }
  if (group === 'quiet') return `No update since ${time}`;
  return `Finished at ${time}`;
}

function getLead(
  session: PipelineSession,
  group: PipelineGroup | null,
  now: number,
  isAnswered: boolean,
) {
  const time = formatPipelineTime(session.updatedAt, now);
  if (isAnswered && group !== 'working') return `${ANSWERED_LINE}.`;
  if (group === 'waiting') return `Waiting since ${time}`;
  if (group === 'working') {
    const since = formatPipelineTime(
      session.turnStartedAt ?? session.updatedAt,
      now,
    );
    const activity = getActivity(session);
    return `${activity ? `${activity}. ` : ''}Working since ${since}${session.branch ? ` on ${session.branch}` : ''}`;
  }
  if (group === 'quiet')
    return `No update for ${formatSpan(now - session.updatedAt)}. It may have stopped, or be waiting on a permission prompt.`;
  return `Finished its turn at ${time}.`;
}

// A merge clears what the session raised before it; a later turn raises again whatever still stands.
const isClearedByMerge = (
  session: PipelineSession,
  merged: PipelineMergedPr[],
) =>
  session.url !== null &&
  merged.some(
    (pr) => pr.sessionUrl === session.url && pr.mergedAt >= session.updatedAt,
  );

// Set aside by its words, so a session repeating the same line on a later turn doesn't bring it back.
const toHands = (
  session: PipelineSession,
  settled: SettledAskView[],
): PipelineHand[] =>
  session.raisedHands.map((text) => {
    const outcome = settled.find(
      (ask) => ask.sessionId === session.sessionId && ask.text === text,
    )?.outcome;
    return {
      text,
      isTask: !stripLinks(text).includes('?'),
      settled: outcome === undefined || outcome === 'open' ? null : outcome,
    };
  });

function toSessionEntry(
  session: PipelineSession,
  prs: PipelineInboxPr[],
  merged: PipelineMergedPr[],
  answered: Record<string, number>,
  settled: SettledAskView[],
  now: number,
): PipelineEntry {
  const sessionPrs = getSessionPrs(session, prs);
  const safePrs = sessionPrs.map(toSafePr);
  const allItems = toSafeItems(sessionPrs, settled, now);
  const ownerItems = getOpenItems(allItems, answered);
  const decisions = toOpenDecisions(sessionPrs, answered, now);
  // A reply to 🚩 lines goes to the first pull request, after the turn that raised them.
  const isReplied =
    sessionPrs[0] !== undefined &&
    (answered[`${sessionPrs[0].number}:reply`] ?? 0) >= session.updatedAt;
  const hands =
    isReplied || isClearedByMerge(session, merged)
      ? []
      : toHands(session, settled);
  const asks =
    allItems.length > 0
      ? ownerItems.filter(isOpenAsk).map((item) => toAsk(item.text))
      : hands.filter(isOpenAsk).map((hand) => toAsk(hand.text));
  const isAnswered =
    asks.length === 0 &&
    (ownerItems.length < allItems.length ||
      (isReplied && session.raisedHands.length > 0));
  const baseGroup = getSessionGroup(session, now);
  const getGroup = (): PipelineGroup | null => {
    // A finished or quiet session that still holds asks is waiting on the owner.
    if (asks.length > 0 && (baseGroup === 'finished' || baseGroup === 'quiet'))
      return 'waiting';
    if (baseGroup !== 'waiting' || asks.length > 0) return baseGroup;
    return now - session.updatedAt > IDLE_KEEP_MS ? null : 'finished';
  };
  const group = getGroup();
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
    isDriven: now - session.updatedAt <= IDLE_KEEP_MS,
    time,
    subtitle: withDecisions(
      getSubtitle(group, asks, time, session, now, isAnswered),
      decisions,
    ),
    lead: getLead(session, group, now, isAnswered),
    asks,
    sessionId: session.sessionId,
    hands: allItems.length > 0 ? [] : hands,
    prs: safePrs,
    ownerItems,
    goodToKnow: unique(sessionPrs.flatMap((pr) => pr.status?.goodToKnow ?? [])),
    decisions,
    gallery: toGalleryItems(sessionPrs),
    at: session.updatedAt,
  };
}

function toPrEntry(
  pr: PipelineInboxPr,
  answered: Record<string, number>,
  settled: SettledAskView[],
  now: number,
): PipelineEntry {
  const status = pr.status;
  const safePr = toSafePr(pr);
  const ownerItems = getOpenItems(toSafeItems([pr], settled, now), answered);
  const asks = ownerItems.filter(isOpenAsk).map((item) => toAsk(item.text));
  const time = formatPipelineTime(status?.updatedAt ?? 0, now);
  const isWaiting = asks.length > 0;
  return {
    key: `pr-${pr.number}`,
    name: toSentence(status?.sessionTitle || pr.title),
    url: toHttps(status?.sessionUrl ?? pr.bodySessionUrl),
    group: isWaiting ? 'waiting' : 'finished',
    isPrOnly: true,
    isDriven: false,
    time,
    subtitle: isWaiting
      ? `${time} · ${asks.length >= 2 ? `${asks.length} asks · ` : ''}${asks[0]}`
      : `${time} · You handled everything`,
    lead: isWaiting ? `Waiting since ${time}` : 'You handled everything it asked.',
    asks,
    sessionId: null,
    hands: [],
    prs: [safePr],
    ownerItems,
    goodToKnow: status?.goodToKnow ?? [],
    decisions: toOpenDecisions([pr], answered, now),
    gallery: toGalleryItems([pr]),
    at: status?.updatedAt ?? 0,
  };
}

// A reply answers 🚩 lines when no question was asked; feedback sits beside the questions, tied to none.
// A decision slot is the calls made for the owner on one pull request, kept or changed together.
export type AnswerSlotKind = 'question' | 'reply' | 'feedback' | 'decision';

export interface AnswerSlot {
  id: string;
  /** What the server records once it is sent, so the ask stops counting as waiting. */
  mark: string | null;
  prNumber: number;
  statusAt: number;
  /** Plain text, as it is sent. */
  question: string;
  /** The question as the owner reads it, links and all. */
  text: string;
  options: PipelineOption[];
  isMulti: boolean;
  kind: AnswerSlotKind;
  /** The decisions a decision slot lists, in order; empty for every other kind. */
  decisions: string[];
}

export const DECISIONS_QUESTION = 'Decisions I made for you';

function getAskSlots(entry: PipelineEntry): AnswerSlot[] {
  const [pr] = entry.prs;
  const toFreeSlot = (
    target: PipelinePr,
    kind: AnswerSlotKind,
  ): AnswerSlot => ({
    id: `${entry.key}:${target.number}:${kind}`,
    mark: kind === 'reply' ? `${target.number}:reply` : null,
    prNumber: target.number,
    statusAt: target.status?.updatedAt ?? 0,
    question: kind === 'reply' ? 'Reply to what was raised' : 'Anything else',
    text: kind === 'reply' ? `Reply on #${target.number}` : 'Anything else?',
    options: [],
    isMulti: false,
    kind,
    decisions: [],
  });
  if (entry.ownerItems.some(isOpenAsk)) {
    const questions = entry.ownerItems
      .filter((item) => isOpenAsk(item) && !item.isTask)
      .map(
      (item): AnswerSlot => ({
        id: item.id,
        mark: item.id,
        prNumber: item.prNumber,
        statusAt: item.statusAt,
        question: stripLinks(item.text).slice(0, 500),
        text: item.text,
        options: item.options,
        isMulti: item.isMulti,
        kind: 'question',
        decisions: [],
      }),
    );
    const firstPr = questions[0]?.prNumber ?? entry.ownerItems[0].prNumber;
    const target =
      entry.prs.find((candidate) => candidate.number === firstPr) ?? pr;
    return target ? [...questions, toFreeSlot(target, 'feedback')] : questions;
  }
  const isAsking = entry.hands.some((hand) => isOpenAsk(hand) && !hand.isTask);
  if (!pr || !isAsking) return [];
  return [toFreeSlot(pr, 'reply')];
}

const toDecisionSlots = (entry: PipelineEntry): AnswerSlot[] =>
  entry.prs.flatMap((target) => {
    const listed = entry.decisions.filter(
      (decision) => decision.prNumber === target.number,
    );
    return listed.length === 0
      ? []
      : [
          {
            id: `${entry.key}:${target.number}:decision`,
            mark: `${target.number}:decisions`,
            prNumber: target.number,
            statusAt: listed[0].statusAt,
            question: DECISIONS_QUESTION,
            text: DECISIONS_QUESTION,
            options: [],
            isMulti: false,
            kind: 'decision' as const,
            decisions: listed.map((decision) => decision.text),
          },
        ];
  });

/** What the owner can answer on an entry: each question plus one box for anything else (or one reply when only 🚩 lines were raised), then one slot per pull request for the calls made for them. */
export const getAnswerSlots = (entry: PipelineEntry): AnswerSlot[] => [
  ...getAskSlots(entry),
  ...toDecisionSlots(entry),
];

/** The slots that ask something of the owner, without the optional feedback box or the calls already made. */
export const getAskedSlots = (slots: AnswerSlot[]) =>
  slots.filter((slot) => slot.kind !== 'feedback' && slot.kind !== 'decision');

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

/** Why a pull request can't be merged from the dashboard yet, in the server's words, or null when it can. */
export function getMergeBlock(pr: PipelinePr, ownerItems: PipelineOwnerEntryItem[]) {
  const status = pr.status;
  if (status === null) return 'It has no status comment yet.';
  if (/^in progress\b/i.test(status.state ?? '')) return 'Its session is still working on it.';
  if (pr.labels.includes('merge-conflict')) return 'It conflicts with its base.';
  if (pr.labels.includes('behind-base')) {
    return "It's behind its base. Its session needs to bring it up to date.";
  }
  if (pr.ci === 'running') return 'Checks are still running.';
  if (pr.ci === 'red') return 'A check failed.';
  if (pr.ci !== 'green') return 'No checks have run on it yet.';
  if (!Array.isArray(status.mustDo)) return 'Its status has no Must do list yet.';
  // A step ticked here a moment ago counts before the inbox reads the ticked comment.
  const open = status.mustDo.filter(
    (text) =>
      !ownerItems.some(
        (item) => item.prNumber === pr.number && item.text === text && item.settled !== null,
      ),
  );
  if (open.length > 0) return 'Must do items are still open.';
  const isAsking = ownerItems.some(
    (item) => item.prNumber === pr.number && !item.isTask && item.settled === null,
  );
  return isAsking ? 'It has an open question for you.' : null;
}

export interface MergeTarget {
  prNumber: number;
  isDriven: boolean;
  base: string;
}

/** Every pull request on the dashboard that Merge would take now, once each. */
export const getMergeTargets = (entries: PipelineEntry[]): MergeTarget[] =>
  Array.from(
    new Map(
      entries.flatMap((entry) =>
        entry.prs
          .filter((pr) => getMergeBlock(pr, entry.ownerItems) === null)
          .map((pr) => [pr.number, { prNumber: pr.number, isDriven: entry.isDriven, base: pr.base }] as const),
      ),
    ).values(),
  );

export type PipelineGroups = ReturnType<typeof buildPipeline>;

/** The sessions grouped for the view, newest first; waiting also holds the pull requests that need the owner with no session reporting. */
export function buildPipeline(
  sessions: PipelineSession[],
  inbox: PipelineInbox | null,
  answered: Record<string, number>,
  settled: SettledAskView[],
  now: number,
) {
  const prs = inbox?.prs ?? [];
  const merged = inbox?.merged ?? [];
  const entries = [...sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((session) =>
      toSessionEntry(session, prs, merged, answered, settled, now),
    )
    .filter((entry) => entry.group !== null);
  const sessionUrls = new Set(
    entries.flatMap((entry) => (entry.url === null ? [] : [entry.url])),
  );
  const prEntries = prs
    .filter((pr) => isReady(pr, now) && (pr.status?.ownerItems.length ?? 0) > 0)
    .filter(
      (pr) =>
        ![pr.status?.sessionUrl, pr.bodySessionUrl].some(
          (url) => url && sessionUrls.has(url),
        ),
    )
    .map((pr) => toPrEntry(pr, answered, settled, now))
    .filter((entry) => entry.ownerItems.length > 0);
  const inGroup = (group: PipelineGroup) =>
    [...entries, ...prEntries].filter((entry) => entry.group === group);
  return {
    waiting: inGroup('waiting').sort((a, b) => b.at - a.at),
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
