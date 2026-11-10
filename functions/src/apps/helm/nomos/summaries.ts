import type { AskCommand } from './commands.js';

const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many;

const describeCompleted = (count: number, isAfterOthers: string | null) => {
  if (!count) return null;
  if (isAfterOthers) return `marked ${count} done`;
  return plural(count, 'marked a task done', `marked ${count} tasks done`);
};

export interface EffectCounts {
  made: number;
  updated: number;
  completed: number;
}

const NUMBER_WORDS = [
  'both',
  'all three',
  'all four',
  'all five',
  'all six',
  'all seven',
  'all eight',
  'all nine',
  'all ten',
];

/** A code template with no name or tone, past tense: "Made 2 tasks and marked 1 done"; over several messages sent in a row: "Got both: made 2 tasks". */
export function summarize(counts: EffectCounts, messageCount = 1): string {
  const made = counts.made
    ? plural(counts.made, 'made a task', `made ${counts.made} tasks`)
    : null;
  const updated = counts.updated
    ? plural(
        counts.updated,
        'updated a task',
        `updated ${counts.updated} tasks`,
      )
    : null;
  const completed = describeCompleted(counts.completed, made || updated);
  const parts = [made, updated, completed].filter(
    (part): part is string => part !== null,
  );
  const joined =
    parts.length < 2
      ? (parts[0] ?? '')
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  const prefix = NUMBER_WORDS[messageCount - 2];
  if (!prefix || !joined) {
    return joined.charAt(0).toUpperCase() + joined.slice(1);
  }
  return `Got ${prefix}: ${joined}`;
}

export type CodeQuestionKind = 'couldNotRead' | 'moreToSort';

/** Fixed wording for the two questions code asks when a capture is not fully sorted. */
export const CODE_QUESTION_WORDS: Record<
  CodeQuestionKind,
  { prompt: string; options: { id: string; label: string }[] }
> = {
  couldNotRead: {
    prompt: "This one didn't turn into a task yet. What would you like to do?",
    options: [
      { id: 'makeTask', label: 'Make it a task as written' },
      { id: 'delete', label: 'Delete it' },
    ],
  },
  moreToSort: {
    prompt: 'That was a lot at once. The rest is still waiting to be sorted.',
    options: [
      { id: 'sortRest', label: 'Sort the rest' },
      { id: 'leave', label: 'Leave it for now' },
    ],
  },
};

/** The sealed half of a code-built question: no held commands, nothing it is about, and no answer until one is given. */
export const buildCodeQuestion = (kind: CodeQuestionKind) => ({
  kind,
  builtBy: 'code' as const,
  shape: 'pickOne' as const,
  prompt: CODE_QUESTION_WORDS[kind].prompt,
  options: CODE_QUESTION_WORDS[kind].options.map((option) => ({
    ...option,
    detail: null,
    ref: null,
  })),
  allowsSomethingElse: false,
  noneOption: false,
  recordKinds: [],
  dateMode: null,
  number: null,
  heldCommands: [],
  aboutRef: null,
  answer: null,
});

export type PickKind = 'whichPerson' | 'whichPlace';

/** Fixed wording for the "which one?" questions asked when a name fits more than one record. */
export const PICK_WORDS: Record<
  PickKind,
  { prompt: (name: string) => string; newLabel: string; noneLabel: string }
> = {
  whichPerson: {
    prompt: (name) => `Which ${name}?`,
    newLabel: 'Someone new',
    noneLabel: "Don't link anyone",
  },
  whichPlace: {
    prompt: (name) => `Which ${name}?`,
    newLabel: 'New place',
    noneLabel: "Don't link a place",
  },
};

export interface PickCandidate {
  id: string;
  label: string;
  detail: string | null;
}

export type HeldLink =
  | {
      kind: 'linkWho';
      taskIds: string[];
      mention: {
        name: string;
        kind: string;
        relation: string | null;
        species: string | null;
        organizationKind: string | null;
      };
    }
  | { kind: 'linkPlace'; taskIds: string[]; place: { name: string } };

/** The sealed half of a "which one?" question: the candidates, a new one and none, with the link held until one is picked. */
export const buildPickQuestion = (input: {
  kind: PickKind;
  name: string;
  candidates: PickCandidate[];
  held: HeldLink;
}) => {
  const collection = input.kind === 'whichPerson' ? 'who' : 'places';
  const words = PICK_WORDS[input.kind];
  return {
    kind: input.kind,
    builtBy: 'code' as const,
    shape: 'pickOne' as const,
    prompt: words.prompt(input.name),
    options: [
      ...input.candidates.map((candidate) => ({
        ...candidate,
        ref: { collection, id: candidate.id },
      })),
      { id: 'new', label: words.newLabel, detail: null, ref: null },
      { id: 'none', label: words.noneLabel, detail: null, ref: null },
    ],
    allowsSomethingElse: false,
    noneOption: false,
    recordKinds: [],
    dateMode: null,
    number: null,
    heldCommands: [input.held],
    aboutRef: input.held.taskIds[0]
      ? { collection: 'tasks', id: input.held.taskIds[0] }
      : null,
    answer: null,
  };
};

/** The line said after a spoken turn that asked "Which Sam?": "Which Sam, Sam Rivera or Sam Patel?". */
export const buildSpokenPick = (
  name: string,
  labels: string[],
  newWord = 'someone new',
) => {
  const spoken = labels.slice(0, 3);
  const list =
    spoken.length === 1
      ? `${spoken[0]} or ${newWord}`
      : `${spoken.slice(0, -1).join(', ')} or ${spoken[spoken.length - 1]}`;
  return `Which ${name}, ${list}?`;
};

/** The words code adds to a model-written question: the model never writes them. */
export const ASK_WORDS = {
  yes: 'Yes',
  no: 'No',
  none: 'None of these',
  newWho: 'Someone new',
  newPlace: 'New place',
};

export const ASK_DEFERRED_LINE =
  "I'll ask about that once you've answered a few of the waiting questions.";

export const ALREADY_ANSWERED_LINE = 'That was already answered.';

export const NOTHING_CHANGED_LINE = 'Nothing changed.';

export const buildAnswerKeptLine = (words: string) => `Got it: ${words}.`;

/** The sealed half of a model-written question: no held commands, and no answer until one is given. */
export const buildAskedQuestion = (ask: AskCommand) => ({
  kind: 'asked' as const,
  builtBy: 'model' as const,
  shape: ask.shape,
  prompt: ask.prompt,
  options: ask.options,
  allowsSomethingElse: ask.allowsSomethingElse,
  noneOption: ask.noneOption,
  recordKinds: ask.recordKinds,
  dateMode: ask.dateMode,
  number: ask.number,
  heldCommands: [],
  aboutRef: ask.aboutRef,
  answer: null,
});

const SPOKEN_OPTIONS = 4;
const SPOKEN_FIRST = 3;
const YES_NO_OPENERS = new Set(
  'is are do does did can could should will would have has'.split(' '),
);

const joinOr = (labels: string[]) =>
  labels.length < 2
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;

const toSentence = (prompt: string) =>
  /[?.!:]$/.test(prompt) ? prompt : `${prompt}?`;

/** The line said for an open question, worded per shape; a long list is read in part and the rest is left to the screen. */
export const buildSpokenQuestion = (question: {
  shape: string;
  prompt: string;
  options: { id: string; label: string }[];
}): string => {
  const prompt = toSentence(question.prompt);
  const labels = question.options
    .filter((option) => option.id !== 'none' && option.id !== 'new')
    .map((option) => option.label);
  const isLong = labels.length > SPOKEN_OPTIONS;
  const rest = labels.length - SPOKEN_FIRST;
  const spokenList = isLong
    ? `${labels.slice(0, SPOKEN_FIRST).join(', ')}, or one of ${rest} more on your screen.`
    : null;
  if (question.shape === 'pickOne') {
    return `${prompt} ${spokenList ?? `${joinOr(labels)}?`}`;
  }
  if (question.shape === 'pickSeveral') {
    if (spokenList) return `${prompt} ${spokenList} You can say more than one.`;
    return labels.length === 2
      ? `${prompt} ${labels[0]}, ${labels[1]}, or both?`
      : `${prompt} ${joinOr(labels)}. You can say more than one.`;
  }
  if (question.shape === 'yesNo') {
    const opener = question.prompt
      .trim()
      .split(/\s+/)[0]
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    return YES_NO_OPENERS.has(opener) ? prompt : `${prompt} Yes or no?`;
  }
  return prompt;
};
