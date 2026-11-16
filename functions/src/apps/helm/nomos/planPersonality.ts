import type { SealedPayload } from '../../../appKeys/seal.js';
import type { SetPersonalityCommand } from './commands.js';
import { applyPersonalityCommand } from './personalityChange.js';
import type {
  Effect,
  EffectRef,
  PlannedQuestion,
  QuestionStateEntry,
} from './executeCommands.js';
import {
  KEEP_BOTH_LINES,
  MAX_TRAITS,
  TRAIT_CLASHES,
  TRAIT_LABELS,
  clashKey,
  describePersonalityChange,
  describeTraits,
  findOpenClashes,
  readPersonality,
  type Personality,
  type PersonalityTrait,
} from './personality.js';
export { applyPersonalityCommand };
import {
  baseQuestion,
  buildHabitAnswerExecution,
  toPlannedQuestion,
} from './planHabitCommands.js';

export interface PersonalityPlanInput {
  command: SetPersonalityCommand | null;
  /** The profile's stored personality and old tone, as they are. */
  stored: unknown;
  legacyTone: unknown;
  storedSetAt: number | null;
  profileId: string;
  assistantName: string;
  now: number;
  isUnattended: boolean;
  newId: () => string;
  /** How many effects the turn can still record. */
  room: number;
  /** The turn already writes the profile ("I'm home"); Undo tells effects apart by document, so a second profile change waits for its own turn. */
  isProfileTaken: boolean;
  /** The profile document exists; a turn never creates it. */
  hasProfile: boolean;
}

export interface PersonalityPlan {
  data: {
    personality: Personality;
    personalitySetAt: number;
    lastEditedAt: number;
  } | null;
  effectRefs: EffectRef[];
  effects: Effect[];
  lines: string[];
  notKept: string[];
  questions: PlannedQuestion[];
}

const EMPTY: PersonalityPlan = {
  data: null,
  effectRefs: [],
  effects: [],
  lines: [],
  notKept: [],
  questions: [],
};

const ROOM_LINE = 'Not kept · too much to save in one go';

export const buildPersonalityTitle = (assistantName: string) =>
  `How ${assistantName} talks`;

export const buildOverCapLine = (traits: PersonalityTrait[]) =>
  `Not added · ${describeTraits(traits)} · ${MAX_TRAITS} traits at most, so drop one first`;

export const buildProfileTakenLine = (assistantName: string) =>
  `Not changed · how ${assistantName} talks · ask again in its own message`;

export const buildNoProfileLine = (assistantName: string) =>
  `Not changed · how ${assistantName} talks · change it in Settings`;

const lower = (trait: PersonalityTrait) => TRAIT_LABELS[trait].toLowerCase();

const isSame = (left: Personality, right: Personality) =>
  [...left.traits].sort().join() === [...right.traits].sort().join() &&
  left.honesty === right.honesty &&
  [...left.keptClashes].sort().join() === [...right.keptClashes].sort().join();

const toWrite = (
  input: Pick<
    PersonalityPlanInput,
    'profileId' | 'now' | 'assistantName' | 'stored' | 'storedSetAt'
  >,
  current: Personality,
  next: Personality,
) => {
  const title = { 'sealed.title': buildPersonalityTitle(input.assistantName) };
  const detail = { 'sealed.detail': describePersonalityChange(current, next) };
  return {
    data: {
      personality: next,
      personalitySetAt: input.now,
      lastEditedAt: input.now,
    },
    ref: {
      op: 'update',
      collection: 'profile',
      docId: input.profileId,
    } as EffectRef,
    effect: {
      written: {
        personality: next,
        personalitySetAt: input.now,
        ...title,
        ...detail,
      },
      previous: {
        personality: input.stored ?? null,
        personalitySetAt: input.storedSetAt,
        ...title,
        ...detail,
      },
    },
    line: describePersonalityChange(current, next),
  };
};

export const buildClashQuestion = (
  left: PersonalityTrait,
  right: PersonalityTrait,
) => {
  const key = clashKey(left, right);
  return {
    ...baseQuestion,
    kind: 'clashChoice' as const,
    shape: 'pickOne' as const,
    prompt: `${TRAIT_LABELS[left]} and ${lower(right)} pull against each other. Keep both?`,
    options: [
      {
        id: 'keep',
        label: 'Keep both',
        detail: KEEP_BOTH_LINES[key] ?? null,
        ref: null,
      },
      {
        id: `drop-${right}`,
        label: `Drop ${lower(right)}`,
        detail: null,
        ref: null,
      },
      {
        id: `drop-${left}`,
        label: `Drop ${lower(left)}`,
        detail: null,
        ref: null,
      },
    ],
    heldCommands: [{ kind: 'clashChoice', left, right }],
  };
};

/** What "be more blunt with me" writes, without touching a database: the personality with the change applied, one effect holding the previous value so Undo puts it back, and a question when the change makes a new pair that pulls apart. */
export function planPersonality(input: PersonalityPlanInput): PersonalityPlan {
  if (!input.command) return EMPTY;
  const current = readPersonality(input.stored, input.legacyTone);
  const { next, overCap } = applyPersonalityCommand(current, input.command);
  const capLines = overCap.length > 0 ? [buildOverCapLine(overCap)] : [];
  if (isSame(current, next))
    return {
      ...EMPTY,
      notKept:
        capLines.length > 0
          ? capLines
          : [`That's already how ${input.assistantName} talks`],
    };
  if (input.room < 1) return { ...EMPTY, notKept: [ROOM_LINE] };
  if (!input.hasProfile)
    return { ...EMPTY, notKept: [buildNoProfileLine(input.assistantName)] };
  if (input.isProfileTaken)
    return {
      ...EMPTY,
      notKept: [buildProfileTakenLine(input.assistantName)],
    };
  const write = toWrite(input, current, next);
  const before = new Set(findOpenClashes(current).map(({ key }) => key));
  const fresh = findOpenClashes(next).find(({ key }) => !before.has(key));
  return {
    data: write.data,
    effectRefs: [write.ref],
    effects: [write.effect],
    lines: [write.line],
    notKept: capLines,
    questions:
      fresh && !input.isUnattended
        ? [
            toPlannedQuestion(buildClashQuestion(fresh.left, fresh.right), {
              id: input.newId(),
              now: input.now,
            }),
          ]
        : [],
  };
}

export interface PersonalityResolveInput {
  captureId: string;
  questionId: string;
  optionId: string;
  by: 'tap' | 'voice';
  now: number;
  executionId: string;
  stored: unknown;
  legacyTone: unknown;
  storedSetAt: number | null;
  profileId: string;
  assistantName: string;
  capture: {
    status: string;
    executionIds: string[];
    questionState: Record<string, QuestionStateEntry>;
  };
  opened: Record<string, unknown>;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readHeldPair = (held: unknown) => {
  if (!isRecord(held)) return null;
  return (
    TRAIT_CLASHES.find(
      ([left, right]) => held.left === left && held.right === right,
    ) ?? null
  );
};

/** Decides what answering "Keep both?" writes: the pair is kept, or one of its traits is dropped. A pair already settled, or no longer picked, writes nothing; the question closes either way. */
export function planResolvePersonality(input: PersonalityResolveInput):
  | { refused: 'answered' | 'unknown' | 'gone' }
  | {
      refused: null;
      data: PersonalityPlan['data'];
      execution: Record<string, unknown> | null;
      capture: Record<string, unknown>;
    } {
  const { questionId, optionId, now, capture } = input;
  const state = capture.questionState[questionId];
  const oldQuestions = isRecord(input.opened.questions)
    ? input.opened.questions
    : {};
  const question = oldQuestions[questionId];
  if (!state || !isRecord(question)) return { refused: 'unknown' };
  if (state.answeredAt !== null) return { refused: 'answered' };
  if ((state.dismissedAt ?? null) !== null) return { refused: 'gone' };
  const pair = readHeldPair(
    Array.isArray(question.heldCommands)
      ? question.heldCommands.find(isRecord)
      : null,
  );
  if (!pair) return { refused: 'unknown' };
  const [left, right] = pair;
  const key = clashKey(left, right);
  const choices = ['keep', `drop-${left}`, `drop-${right}`];
  if (!choices.includes(optionId)) return { refused: 'unknown' };
  const current = readPersonality(input.stored, input.legacyTone);
  const isOpen =
    current.traits.includes(left) &&
    current.traits.includes(right) &&
    !current.keptClashes.includes(key);
  const dropped = optionId === `drop-${left}` ? left : right;
  const next = readPersonality(
    optionId === 'keep'
      ? { ...current, keptClashes: [...current.keptClashes, key] }
      : {
          ...current,
          traits: current.traits.filter((trait) => trait !== dropped),
        },
    null,
  );
  const write = isOpen ? toWrite(input, current, next) : null;
  const execution = write
    ? buildHabitAnswerExecution(
        {
          isPrivate: false,
          effectRefs: [write.ref],
          effects: [write.effect],
          lines: [write.line],
          notKept: [],
        },
        { captureId: input.captureId, questionId, now, seal: input.seal },
      )
    : null;
  const questionState = {
    ...capture.questionState,
    [questionId]: { ...state, answeredAt: now },
  };
  const isStillAsking = Object.values(questionState).some(
    (entry) =>
      entry.answeredAt === null && (entry.dismissedAt ?? null) === null,
  );
  return {
    refused: null,
    data: write?.data ?? null,
    execution,
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
              shape: 'pickOne',
              optionId,
              otherText: null,
            },
          },
        },
      },
      status:
        !isStillAsking && capture.status === 'needsYou'
          ? 'sorted'
          : capture.status,
      executionIds: execution
        ? [...capture.executionIds, input.executionId]
        : capture.executionIds,
    },
  };
}
