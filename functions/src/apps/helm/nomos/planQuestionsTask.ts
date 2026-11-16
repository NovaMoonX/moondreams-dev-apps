import type { SealedPayload } from '../../../appKeys/seal.js';
import type { PrivacyFacts } from '../privacy.js';
import type { OfferQuestionsCommand, QuestionsMeeting } from './commands.js';
import {
  planWrites,
  type Effect,
  type PeopleInput,
  type EffectRef,
  type PlannedQuestion,
  type QuestionStateEntry,
} from './executeCommands.js';
import { baseQuestion, toPlannedQuestion } from './planHabitCommands.js';
import { QUESTIONS_MAX, QUESTION_CAP } from './questionsTask.js';

const DAY_MS = 86_400_000;

/** The kind of the code-built question that offers a document's questions as a task. */
export const QUESTIONS_TASK_KIND = 'questionsTask';

/** The words the server writes for the questions-as-a-task offer, kept beside the planner. */
export const QUESTIONS_WORDS = {
  yes: 'Make the task',
  no: 'No thanks',
  offer: (count: number, who: string | null, day: string | null) =>
    `Make ${count === 1 ? 'this question' : `these ${count} questions`}${who ? ` for ${who}` : ''} a task${day ? ` for ${day}` : ''}?`,
  made: (title: string, count: number) =>
    `Made ${title} with ${count === 1 ? '1 question' : `${count} questions`}.`,
};

export const joinNames = (names: string[]) =>
  names.length < 2
    ? (names[0] ?? null)
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

const toDayNumber = (at: number, timeZone: string) =>
  Date.parse(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(at)),
  ) / DAY_MS;

/** The meeting's day as a word: today, tomorrow, a weekday within the week, or the date. */
export const toMeetingDay = (
  startAt: number,
  now: number,
  timeZone: string,
) => {
  const ahead = toDayNumber(startAt, timeZone) - toDayNumber(now, timeZone);
  if (ahead <= 0) return 'today';
  if (ahead === 1) return 'tomorrow';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    ...(ahead < 7
      ? { weekday: 'long' as const }
      : { month: 'short' as const, day: 'numeric' as const }),
  }).format(new Date(startAt));
};

/** The yes/no question that offers a document's questions as a task; its held payload carries the whole draft, so the answer writes only what was shown. */
export const buildQuestionsTaskQuestion = (
  offer: OfferQuestionsCommand,
  input: { id: string; now: number; timeZone: string },
): PlannedQuestion => {
  const sealed = {
    ...baseQuestion,
    kind: QUESTIONS_TASK_KIND,
    shape: 'yesNo',
    prompt: QUESTIONS_WORDS.offer(
      offer.questions.length,
      joinNames(offer.who),
      offer.meeting
        ? toMeetingDay(offer.meeting.startAt, input.now, input.timeZone)
        : null,
    ),
    options: [
      { id: 'yes', label: QUESTIONS_WORDS.yes },
      { id: 'no', label: QUESTIONS_WORDS.no },
    ],
    heldCommands: [
      {
        kind: QUESTIONS_TASK_KIND,
        title: offer.title,
        questions: offer.questions,
        who: offer.who,
        whoIds: offer.whoIds,
        meeting: offer.meeting,
        documentKey: offer.documentKey,
      },
    ],
  };
  return toPlannedQuestion(sealed, input);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readMeeting = (value: unknown): QuestionsMeeting | null =>
  isRecord(value) &&
  typeof value.syncedId === 'string' &&
  typeof value.startAt === 'number' &&
  typeof value.label === 'string'
    ? { syncedId: value.syncedId, startAt: value.startAt, label: value.label }
    : null;

const readHeld = (held: Record<string, unknown>) => {
  const title = typeof held.title === 'string' ? held.title.trim() : '';
  const questions = (Array.isArray(held.questions) ? held.questions : [])
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.slice(0, QUESTION_CAP))
    .slice(0, QUESTIONS_MAX);
  const whoIds = (Array.isArray(held.whoIds) ? held.whoIds : [])
    .filter((id): id is string => typeof id === 'string')
    .slice(0, 4);
  return title === '' || questions.length === 0
    ? null
    : { title, questions, whoIds, meeting: readMeeting(held.meeting) };
};

export interface QuestionsTaskResolveInput {
  captureId: string;
  executionId: string;
  questionId: string;
  optionId: string;
  by: 'tap' | 'voice';
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  newId: () => string;
  capture: {
    status: string;
    executionIds: string[];
    questionState: Record<string, QuestionStateEntry>;
  };
  opened: Record<string, unknown>;
  /** The privacy of the held people, read by the caller, so the task takes their private mark. */
  whoFacts?: { id: string; privacyFacts: PrivacyFacts }[];
}

export type QuestionsTaskResolveResult =
  | { refused: 'answered' | 'unknown' | 'gone' }
  | {
      refused: null;
      /** The task the answer makes, or null when the answer was No. */
      create: { id: string; data: Record<string, unknown> } | null;
      effectRefs: EffectRef[];
      effects: Effect[];
      lines: string[];
      capture: Record<string, unknown>;
    };

/** Decides what answering the questions-as-a-task offer writes, without touching a database: Yes makes the same task a spoken createTask would (a step for each question, the meeting, no readiness answer yet), No makes nothing. The held draft comes from the stored question, never from the tap. */
export function planResolveQuestionsTask(
  input: QuestionsTaskResolveInput,
): QuestionsTaskResolveResult {
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
  if (!held || held.kind !== QUESTIONS_TASK_KIND) return { refused: 'unknown' };
  if (optionId !== 'yes' && optionId !== 'no') return { refused: 'unknown' };
  const draft = readHeld(held);
  if (!draft) return { refused: 'unknown' };
  const made =
    optionId === 'yes'
      ? planWrites({
          commands: [
            {
              kind: 'createTask',
              ref: '$new1',
              title: draft.title,
              due: null,
              isUrgent: false,
              whoRefs: [],
              placeRefs: [],
              projectRef: null,
              questions: draft.questions,
              meeting:
                draft.meeting && draft.meeting.startAt > now
                  ? draft.meeting
                  : null,
              whoIds: draft.whoIds,
            },
          ],
          existing: new Map(),
          captureId: input.captureId,
          executionId: input.executionId,
          now,
          seal: input.seal,
          newId: input.newId,
          people: {
            mentions: [],
            places: [],
            known: (input.whoFacts ?? []).map((who) => ({
              id: who.id,
              kind: 'person',
              name: '',
              aliases: [],
              lastMentionedAt: null,
              privacyFacts: who.privacyFacts,
            })),
            knownPlaces: [],
            assistantName: null,
            assistantNames: [],
            dayKey: '',
            capturedAt: now,
          } as unknown as PeopleInput,
        })
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
    create: made?.creates[0] ?? null,
    effectRefs: made?.effectRefs ?? [],
    effects: made?.effects ?? [],
    lines: made?.creates[0]
      ? [QUESTIONS_WORDS.made(draft.title, draft.questions.length)]
      : [],
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
              shape: 'yesNo',
              optionId,
              otherText: null,
            },
          },
        },
      },
      status:
        !isOpen && capture.status === 'needsYou' ? 'sorted' : capture.status,
    },
  };
}
