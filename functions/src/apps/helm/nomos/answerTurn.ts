import { FREE_TEXT_CAP } from './commands.js';
import type { QuestionStateEntry } from './executeCommands.js';

const DAY_MS = 86_400_000;
const NAME_CAP = 80;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type RecordRef = { collection: 'who' | 'places'; id: string };

/** The answer to a model-written question as the device structures it, before who gave it and when. */
export type QuestionAnswerValue =
  | { shape: 'pickOne' | 'yesNo'; optionId: string; otherText: string | null }
  | { shape: 'pickSeveral'; optionIds: string[]; otherText?: string | null }
  | { shape: 'freeText'; text: string }
  | { shape: 'dateTime'; date: number | null; time: string | null }
  | { shape: 'pickRecord'; ref: RecordRef | null; newName: string | null }
  | { shape: 'number'; value: number };

/** What a question needs to judge an answer against. */
export interface AskedQuestion {
  kind?: string;
  builtBy?: string;
  shape: string;
  prompt: string;
  options: { id: string; label: string }[];
  allowsSomethingElse: boolean;
  recordKinds: string[];
  dateMode: string | null;
  number: {
    min: number | null;
    max: number | null;
    isMoney: boolean;
    decimals: number;
  } | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toWords = (value: unknown, cap: number) =>
  typeof value === 'string' && value.trim() && value.trim().length <= cap
    ? value.trim()
    : null;

const checkPickOne = (
  question: AskedQuestion,
  value: Record<string, unknown>,
): QuestionAnswerValue | null => {
  const shape = question.shape === 'yesNo' ? 'yesNo' : 'pickOne';
  const other =
    value.otherText === null || value.otherText === undefined
      ? null
      : toWords(value.otherText, FREE_TEXT_CAP);
  if (value.otherText !== null && value.otherText !== undefined) {
    return other && question.allowsSomethingElse
      ? { shape, optionId: 'other', otherText: other }
      : null;
  }
  return typeof value.optionId === 'string' &&
    question.options.some((option) => option.id === value.optionId)
    ? { shape, optionId: value.optionId, otherText: null }
    : null;
};

const checkPickSeveral = (
  question: AskedQuestion,
  value: Record<string, unknown>,
): QuestionAnswerValue | null => {
  const ids = value.optionIds;
  if (value.otherText !== null && value.otherText !== undefined) return null;
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const unique = [...new Set(ids)];
  const known = new Set([...question.options.map((o) => o.id), 'none']);
  const isValid = unique.every(
    (id): id is string => typeof id === 'string' && known.has(id),
  );
  const hasNone = unique.includes('none');
  return isValid && (!hasNone || unique.length === 1)
    ? { shape: 'pickSeveral', optionIds: unique as string[] }
    : null;
};

const checkNumber = (
  question: AskedQuestion,
  value: Record<string, unknown>,
): QuestionAnswerValue | null => {
  const range = question.number;
  const figure = value.value;
  if (!range || typeof figure !== 'number' || !Number.isFinite(figure)) {
    return null;
  }
  const isWhole = range.isMoney || range.decimals === 0;
  if (isWhole && !Number.isInteger(figure)) return null;
  if (range.min !== null && figure < range.min) return null;
  if (range.max !== null && figure > range.max) return null;
  return { shape: 'number', value: figure };
};

const checkDateTime = (
  question: AskedQuestion,
  value: Record<string, unknown>,
): QuestionAnswerValue | null => {
  const { date, time } = value;
  const isDateOk =
    date === null ||
    (typeof date === 'number' && Number.isInteger(date) && date % DAY_MS === 0);
  const isTimeOk =
    time === null || (typeof time === 'string' && TIME_RE.test(time));
  if (!isDateOk || !isTimeOk) return null;
  const mode = question.dateMode ?? 'dateTime';
  const wantsDate = mode !== 'time';
  const wantsTime = mode !== 'date';
  return (date !== null) === wantsDate && (time !== null) === wantsTime
    ? {
        shape: 'dateTime',
        date: date as number | null,
        time: time as string | null,
      }
    : null;
};

const checkRecord = (
  question: AskedQuestion,
  value: Record<string, unknown>,
): QuestionAnswerValue | null => {
  const newName = toWords(value.newName, NAME_CAP);
  const ref = value.ref;
  if (newName && (ref === null || ref === undefined)) {
    return { shape: 'pickRecord', ref: null, newName };
  }
  if (
    !isRecord(ref) ||
    (value.newName !== null && value.newName !== undefined)
  ) {
    return null;
  }
  const allowed: string[] = question.recordKinds.map((kind) =>
    kind === 'place' ? 'places' : 'who',
  );
  return typeof ref.id === 'string' &&
    ID_RE.test(ref.id) &&
    typeof ref.collection === 'string' &&
    allowed.includes(ref.collection)
    ? {
        shape: 'pickRecord',
        ref: {
          collection: ref.collection as RecordRef['collection'],
          id: ref.id,
        },
        newName: null,
      }
    : null;
};

/** The structured answer when it fits the question's shape (options that exist, a number in range, a date a person could pick), else null: the words go to the model instead. */
export function checkQuestionAnswer(
  question: AskedQuestion,
  value: unknown,
): QuestionAnswerValue | null {
  if (!isRecord(value) || value.shape !== question.shape) return null;
  if (question.shape === 'pickOne' || question.shape === 'yesNo') {
    return checkPickOne(question, value);
  }
  if (question.shape === 'pickSeveral')
    return checkPickSeveral(question, value);
  if (question.shape === 'freeText') {
    const text = toWords(value.text, FREE_TEXT_CAP);
    return text ? { shape: 'freeText', text } : null;
  }
  if (question.shape === 'number') return checkNumber(question, value);
  if (question.shape === 'dateTime') return checkDateTime(question, value);
  if (question.shape === 'pickRecord') return checkRecord(question, value);
  return null;
}

/** The asked turn as the answer turn finds it when it settles. */
export interface AskedCapture {
  status: string;
  questionState: Record<string, QuestionStateEntry>;
  opened: Record<string, unknown>;
}

export type AnswerTurnPlan =
  | { kind: 'stale' }
  | {
      kind: 'apply';
      questionState: Record<string, QuestionStateEntry>;
      sealed: Record<string, unknown>;
      status: string;
    };

const isOpenAsk = (
  question: unknown,
): question is AskedQuestion & {
  kind: string;
} =>
  isRecord(question) &&
  question.kind === 'asked' &&
  question.builtBy === 'model';

/** Decides what an answer turn writes to the turn that asked, without touching a database: a question that is gone, answered or not model-written is stale and writes nothing; otherwise it is answered with the checked structured value, or the words when that did not fit. */
export function planAnswerTurn(input: {
  asked: AskedCapture | null;
  questionId: string;
  value: unknown;
  words: string;
  by: 'tap' | 'voice';
  turnCaptureId: string;
  now: number;
}): AnswerTurnPlan {
  const { asked, questionId, now } = input;
  const state = asked?.questionState[questionId];
  const oldQuestions = (asked?.opened.questions ?? {}) as Record<
    string,
    unknown
  >;
  const question = oldQuestions[questionId];
  if (!asked || !state || state.answeredAt !== null || !isOpenAsk(question)) {
    return { kind: 'stale' };
  }
  const value = checkQuestionAnswer(question, input.value) ?? {
    shape: 'freeText' as const,
    text: input.words.trim().slice(0, FREE_TEXT_CAP),
  };
  const questionState = {
    ...asked.questionState,
    [questionId]: { ...state, answeredAt: now },
  };
  const isOpen = Object.values(questionState).some(
    (entry) => entry.answeredAt === null,
  );
  return {
    kind: 'apply',
    questionState,
    sealed: {
      ...asked.opened,
      questions: {
        ...oldQuestions,
        [questionId]: {
          ...question,
          answer: {
            by: input.by,
            at: now,
            turnCaptureId: input.turnCaptureId,
            ...value,
          },
        },
      },
    },
    status: !isOpen && asked.status === 'needsYou' ? 'sorted' : asked.status,
  };
}

/** What the model is told an answer turn answers: the question, its choices and the answer in words. */
export const describeAnsweredQuestion = (
  question: { prompt: string; options: { label: string }[] },
  answer: string,
) =>
  [
    `This turn answers your question: ${question.prompt}`,
    ...(question.options.length > 0
      ? [
          `Options: ${question.options.map((option) => option.label).join(', ')}`,
        ]
      : []),
    `Answer: ${answer}`,
  ].join(' · ');
