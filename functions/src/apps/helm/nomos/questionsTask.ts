// Generated from src/apps/helm/engine/questionsTask.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
/** Questions for someone: a task whose steps are questions, linked to a meeting, and the check before it. Pure, shared by the device and the server (vendored). */

const HOUR_MS = 3_600_000;

export const QUESTIONS_MAX = 12;
export const QUESTION_CAP = 160;
/** The check before the meeting shows from this long before it starts. */
export const READY_CHECK_HOURS = 36;

/** The meeting a task's questions are for: the synced event's id and when it starts, readable so Today can find it. */
export interface TaskMeeting {
  syncedId: string;
  startAt: number;
}

/** The answer to "Do they feel ready?" before this meeting. */
export interface TaskReadyAnswer {
  answer: 'ready' | 'notYet';
  at: number;
  /** The meeting start it answered for, so a moved meeting asks again. */
  forStartAt: number;
}

export interface QuestionsCount {
  total: number;
  answered: number;
  toAsk: number;
}

export const countQuestions = (
  stepState: Record<string, { doneAt: number | null }>,
): QuestionsCount => {
  const steps = Object.values(stepState);
  const answered = steps.filter((step) => step.doneAt !== null).length;
  return { total: steps.length, answered, toAsk: steps.length - answered };
};

/** Whether Today asks "Do they feel ready?": an open task with a question still to ask, its meeting ahead within the window, and no answer yet for this start. */
export const isReadyCheckDue = (
  input: {
    status: string;
    meeting: TaskMeeting | null;
    readyAnswer: TaskReadyAnswer | null;
    count: QuestionsCount;
  },
  now: number,
) =>
  input.status === 'open' &&
  input.meeting !== null &&
  input.count.toAsk > 0 &&
  input.meeting.startAt > now &&
  input.meeting.startAt - now <= READY_CHECK_HOURS * HOUR_MS &&
  (input.readyAnswer === null ||
    input.readyAnswer.forStartAt !== input.meeting.startAt);

const NUMBER_WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

const say = (count: number) => NUMBER_WORDS[count] ?? String(count);

/** "two are answered and four are to ask Monday", or "all six are answered", from the count and the meeting's day word. */
export const questionsProgressWords = (count: QuestionsCount, day: string) => {
  if (count.toAsk === 0) return `all ${say(count.total)} are answered`;
  const verb = (n: number) => (n === 1 ? 'is' : 'are');
  const toAsk = `${say(count.toAsk)} ${verb(count.toAsk)} to ask ${day}`;
  return count.answered === 0
    ? toAsk
    : `${say(count.answered)} ${verb(count.answered)} answered and ${toAsk}`;
};

/** "Of your six questions for Priya and Sam, two are answered and four are to ask Monday." */
export const questionsReadoutLine = (
  count: QuestionsCount,
  forWho: string | null,
  day: string,
) =>
  `Of your ${say(count.total)} ${count.total === 1 ? 'question' : 'questions'}${forWho ? ` for ${forWho}` : ''}, ${questionsProgressWords(count, day)}.`;
