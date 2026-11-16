import type { SealedPayload } from '../../../appKeys/seal.js';
import type { ResearchCommand } from './commands.js';
import type {
  Effect,
  EffectRef,
  PlannedQuestion,
  QuestionStateEntry,
} from './executeCommands.js';
import { baseQuestion, toPlannedQuestion } from './planHabitCommands.js';
import {
  RESEARCH_DEPTHS,
  pickResearchDepth,
  readResearchAllowance,
  readResearchArrival,
  toResearchMonth,
  type ResearchDepth,
} from './research.js';

/** The words the server writes for research, kept beside the planner; the device's own copies are in `HELM_COPY`. */
export const RESEARCH_WORDS = {
  arrival: {
    fewMinutes: 'Give me about 2 minutes.',
    fiveToTen: "About 5 to 10 minutes; I'll tell you when it's in.",
    byMorning: 'It will be ready by morning.',
  },
  looking: (subject: string) => `Looking into ${subject}`,
  depthQuestion: (subject: string) => `How deep should I look into ${subject}?`,
  quick: 'A quick look',
  thorough: 'A thorough look',
  alwaysQuick: 'Always a quick look',
  alwaysThorough: 'Always a thorough look',
  thoroughLocked: (resetOn: string) =>
    `Thorough looks are used up this month; they come back ${resetOn}.`,
  cappedLine: (resetOn: string) =>
    `This month's web searches are used up, so this is from what I already know. Want me to look on the web on ${resetOn}?`,
  rerunYes: (resetOn: string) => `Look on ${resetOn}`,
  rerunNo: 'This is enough',
  tooMuch: 'That was too much to look into in one go',
};

/** What one person's month of research holds, kept at `apps/helm/server/{uid}/research/usage`: `cents` counts what is spent and what is held for runs under way. */
export interface ResearchUsageDoc {
  month: string;
  cents: number;
  searches: number;
  reserved: Record<string, number>;
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** The stored usage as this month's: one from another month reads as empty. */
export function readUsageDoc(
  raw: Record<string, unknown> | undefined,
  now: number,
  timeZone: string,
): ResearchUsageDoc {
  const month = toResearchMonth(now, timeZone);
  if (!raw || raw.month !== month) {
    return { month, cents: 0, searches: 0, reserved: {} };
  }
  const reserved =
    typeof raw.reserved === 'object' && raw.reserved !== null
      ? Object.fromEntries(
          Object.entries(raw.reserved as Record<string, unknown>).filter(
            (entry): entry is [string, number] => isNumber(entry[1]),
          ),
        )
      : {};
  return {
    month,
    cents: isNumber(raw.cents) ? raw.cents : 0,
    searches: isNumber(raw.searches) ? raw.searches : 0,
    reserved,
  };
}

export const withReserved = (
  usage: ResearchUsageDoc,
  id: string,
  cents: number,
): ResearchUsageDoc => ({
  ...usage,
  cents: usage.cents + cents,
  reserved: { ...usage.reserved, [id]: cents },
});

/** Replaces what an item held with what it really cost; an item that held nothing (its month ended, or it was released first) still counts what it spent. */
export const withSettled = (
  usage: ResearchUsageDoc,
  id: string,
  spentCents: number,
  searches: number,
): ResearchUsageDoc => ({
  ...usage,
  cents: Math.max(0, usage.cents - (usage.reserved[id] ?? 0) + spentCents),
  searches: usage.searches + searches,
  reserved: Object.fromEntries(
    Object.entries(usage.reserved).filter(([key]) => key !== id),
  ),
});

export const withReleased = (usage: ResearchUsageDoc, id: string) =>
  withSettled(usage, id, 0, 0);

/** What the device shows as "about 4 thorough looks left"; the server's own usage decides. */
export const toAllowanceMirror = (
  usage: ResearchUsageDoc,
  now: number,
  timeZone: string,
) => ({
  month: usage.month,
  leftCents: readResearchAllowance(usage, 'light', now, timeZone).leftCents,
});

/** "Dec 1" for a date-only value. */
export const toResetWords = (resetOn: number) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(resetOn);

/** Where a research item starts running: at the asked depth when the month allows it, a quick look when only that fits, and a quick look from general knowledge, with nothing held, when nothing does. */
export function planStart(input: {
  id: string;
  wanted: ResearchDepth;
  usage: ResearchUsageDoc;
  now: number;
  timeZone: string;
}) {
  const fits = (depth: ResearchDepth) =>
    readResearchAllowance(input.usage, depth, input.now, input.timeZone).isLive;
  const live = (['thorough', 'light'] as const)
    .filter((depth) => input.wanted === 'thorough' || depth === 'light')
    .find(fits);
  const depth = live ?? 'light';
  const reservedCents = live ? RESEARCH_DEPTHS[depth].estimateCents : 0;
  return {
    depth,
    isWithoutWeb: !live,
    reservedCents,
    usage: live
      ? withReserved(input.usage, input.id, reservedCents)
      : input.usage,
    resetOn: readResearchAllowance(
      input.usage,
      depth,
      input.now,
      input.timeZone,
    ).resetOn,
  };
}

export const toStartFields = (
  start: ReturnType<typeof planStart>,
  now: number,
) => ({
  status: 'preparing',
  depth: start.depth,
  isWithoutWeb: start.isWithoutWeb,
  reservedCents: start.reservedCents,
  lastEditedAt: now,
});

const arrivalWords = (depth: ResearchDepth) =>
  RESEARCH_WORDS.arrival[readResearchArrival(depth, 'now')];

/** The pickOne that asks how deep to look; Thorough is shown locked, with why in its detail, when the month can't pay for one. */
const buildDepthQuestion = (
  subject: string,
  researchId: string,
  allowance: { canThorough: boolean; resetOn: number },
) => ({
  ...baseQuestion,
  kind: 'researchDepth' as const,
  shape: 'pickOne' as const,
  prompt: RESEARCH_WORDS.depthQuestion(subject),
  options: [
    { id: 'quick', label: RESEARCH_WORDS.quick, detail: null },
    allowance.canThorough
      ? { id: 'thorough', label: RESEARCH_WORDS.thorough, detail: null }
      : {
          id: 'thoroughLocked',
          label: RESEARCH_WORDS.thorough,
          detail: RESEARCH_WORDS.thoroughLocked(
            toResetWords(allowance.resetOn),
          ),
        },
    { id: 'alwaysQuick', label: RESEARCH_WORDS.alwaysQuick, detail: null },
    ...(allowance.canThorough
      ? [
          {
            id: 'alwaysThorough',
            label: RESEARCH_WORDS.alwaysThorough,
            detail: null,
          },
        ]
      : []),
  ],
  heldCommands: [{ kind: 'researchDepth', researchId }],
});

/** The yes or no a look from general knowledge ends with; only a yes writes `rerunOn`. */
export const buildRerunQuestion = (researchId: string, resetOn: number) => ({
  ...baseQuestion,
  kind: 'researchRerun' as const,
  shape: 'yesNo' as const,
  prompt: RESEARCH_WORDS.cappedLine(toResetWords(resetOn)),
  options: [
    { id: 'yes', label: RESEARCH_WORDS.rerunYes(toResetWords(resetOn)) },
    { id: 'no', label: RESEARCH_WORDS.rerunNo },
  ],
  heldCommands: [{ kind: 'researchRerun', researchId, resetOn }],
});

export interface ResearchPlan {
  creates: { id: string; doc: Record<string, unknown> }[];
  effectRefs: EffectRef[];
  effects: Effect[];
  lines: string[];
  notKept: string[];
  questions: PlannedQuestion[];
  /** The usage as it stands after the turn; null when the turn didn't change it. */
  usage: ResearchUsageDoc | null;
}

export interface ResearchPlanInput {
  commands: ResearchCommand[];
  profileDepth: ResearchDepth | null;
  usage: ResearchUsageDoc;
  timeZone: string;
  now: number;
  captureId: string;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  /** How many effects the turn may still write. */
  room: number;
}

const EMPTY: ResearchPlan = {
  creates: [],
  effectRefs: [],
  effects: [],
  lines: [],
  notKept: [],
  questions: [],
  usage: null,
};

/** Plans each asked look-up: a record that starts at once at a depth the month pays for, one that waits on the person's pick of depth, or one that answers from general knowledge when the month is spent. The reply's words are code's. */
export function planResearch(input: ResearchPlanInput): ResearchPlan {
  const step = (acc: ResearchPlan, command: ResearchCommand): ResearchPlan => {
    if (acc.effects.length >= input.room) {
      return { ...acc, notKept: [...acc.notKept, RESEARCH_WORDS.tooMuch] };
    }
    const usage = acc.usage ?? input.usage;
    const id = input.newId();
    const said = pickResearchDepth({
      said: command.depth,
      profileDefault: input.profileDepth,
      isDecision: command.isDecision,
    });
    const quickLive = readResearchAllowance(
      usage,
      'light',
      input.now,
      input.timeZone,
    ).isLive;
    const isAsking = said === 'ask' && quickLive;
    const start = planStart({
      id,
      wanted: said === 'ask' ? 'light' : said,
      usage,
      now: input.now,
      timeZone: input.timeZone,
    });
    const base = {
      mode: 'asked',
      captureId: input.captureId,
      projectId: null,
      searchesUsed: 0,
      costCents: 0,
      rerunOn: null,
      startedAt: null,
      preparedAt: null,
      cancelledAt: null,
      createdAt: input.now,
      lastEditedAt: null,
      sealed: input.seal({
        question: command.question,
        subject: command.subject,
        overview: null,
        sources: [],
      }),
    };
    const doc = isAsking
      ? {
          ...base,
          status: 'asking',
          depth: null,
          isWithoutWeb: false,
          reservedCents: 0,
        }
      : { ...base, ...toStartFields(start, input.now) };
    const allowance = readResearchAllowance(
      usage,
      'thorough',
      input.now,
      input.timeZone,
    );
    return {
      ...acc,
      creates: [...acc.creates, { id, doc }],
      effectRefs: [
        ...acc.effectRefs,
        { op: 'create', collection: 'research', docId: id },
      ],
      effects: [
        ...acc.effects,
        { written: { 'sealed.title': command.subject }, previous: null },
      ],
      lines: isAsking
        ? acc.lines
        : [
            ...acc.lines,
            `${RESEARCH_WORDS.looking(command.subject)}. ${arrivalWords(start.depth)}`,
          ],
      questions: isAsking
        ? [
            ...acc.questions,
            toPlannedQuestion(
              buildDepthQuestion(command.subject, id, allowance),
              { id: input.newId(), now: input.now },
            ),
          ]
        : acc.questions,
      usage: isAsking
        ? acc.usage
        : start.usage === usage
          ? acc.usage
          : start.usage,
    };
  };
  return input.commands.reduce(step, EMPTY);
}

export interface ResearchResolveInput {
  questionId: string;
  optionId: string;
  by: 'tap' | 'voice';
  now: number;
  /** The item the question holds, as stored; null when it is gone. */
  research: { id: string; status: string } | null;
  usage: ResearchUsageDoc;
  timeZone: string;
  capture: {
    status: string;
    executionIds: string[];
    questionState: Record<string, QuestionStateEntry>;
  };
  opened: Record<string, unknown>;
}

export type ResearchResolveResult =
  | { refused: 'answered' | 'unknown' | 'gone' }
  | {
      refused: null;
      research: { id: string; data: Record<string, unknown> } | null;
      usage: ResearchUsageDoc | null;
      profile: Record<string, unknown> | null;
      capture: Record<string, unknown>;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const DEPTH_OPTIONS: Record<
  string,
  { depth: ResearchDepth; isDefault: boolean }
> = {
  quick: { depth: 'light', isDefault: false },
  thorough: { depth: 'thorough', isDefault: false },
  alwaysQuick: { depth: 'light', isDefault: true },
  alwaysThorough: { depth: 'thorough', isDefault: true },
};

/** Decides what answering a research question writes, without touching a database. A depth starts the item at what the month allows now ("always" also keeps it as the default), "Look on Dec 1" keeps the date for the hourly rerun, and the question is closed either way. */
export function planResolveResearch(
  input: ResearchResolveInput,
): ResearchResolveResult {
  const { questionId, optionId, now, capture } = input;
  const state = capture.questionState[questionId];
  const oldQuestions = isRecord(input.opened.questions)
    ? input.opened.questions
    : {};
  const question = oldQuestions[questionId];
  if (!state || !isRecord(question)) return { refused: 'unknown' };
  if (state.answeredAt !== null) return { refused: 'answered' };
  if ((state.dismissedAt ?? null) !== null) return { refused: 'gone' };
  const held = Array.isArray(question.heldCommands)
    ? question.heldCommands.find(isRecord)
    : null;
  const isDepth = held?.kind === 'researchDepth';
  const isRerun = held?.kind === 'researchRerun';
  if (!held || (!isDepth && !isRerun)) return { refused: 'unknown' };
  const options = Array.isArray(question.options)
    ? question.options.filter(isRecord).map((option) => option.id)
    : [];
  if (!options.includes(optionId)) return { refused: 'unknown' };
  if (!input.research || input.research.id !== held.researchId) {
    return { refused: 'gone' };
  }
  if (isDepth && !DEPTH_OPTIONS[optionId]) return { refused: 'unknown' };
  const isOnTime = isDepth
    ? input.research.status === 'asking'
    : input.research.status === 'ready' || input.research.status === 'done';
  if (!isOnTime) return { refused: 'gone' };

  const picked = DEPTH_OPTIONS[optionId];
  const start =
    isDepth && picked
      ? planStart({
          id: input.research.id,
          wanted: picked.depth,
          usage: input.usage,
          now,
          timeZone: input.timeZone,
        })
      : null;
  const resetOn =
    isRerun && typeof held.resetOn === 'number' ? held.resetOn : null;
  const research =
    start !== null
      ? { id: input.research.id, data: toStartFields(start, now) }
      : optionId === 'yes' && resetOn !== null
        ? {
            id: input.research.id,
            data: { rerunOn: resetOn, lastEditedAt: now },
          }
        : null;
  const usage = start !== null && start.reservedCents > 0 ? start.usage : null;
  const profile =
    start !== null && (picked?.isDefault || usage !== null)
      ? {
          ...(picked?.isDefault ? { researchDepth: picked.depth } : {}),
          ...(usage
            ? {
                researchAllowance: toAllowanceMirror(
                  usage,
                  now,
                  input.timeZone,
                ),
              }
            : {}),
        }
      : null;
  const questionState = {
    ...capture.questionState,
    [questionId]: { ...state, answeredAt: now },
  };
  const isOpen = Object.values(questionState).some(
    (entry) =>
      entry.answeredAt === null && (entry.dismissedAt ?? null) === null,
  );
  return {
    refused: null,
    research,
    usage,
    profile,
    capture: {
      questionState,
      sealed: {
        ...input.opened,
        questions: {
          ...oldQuestions,
          [questionId]: {
            ...question,
            answer: {
              by: input.by,
              at: now,
              turnCaptureId: null,
              shape: isDepth ? 'pickOne' : 'yesNo',
              optionId,
              otherText: null,
            },
          },
        },
      },
      status:
        !isOpen && capture.status === 'needsYou' ? 'sorted' : capture.status,
      executionIds: capture.executionIds,
    },
  };
}
