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

/** The result line of a noted fact: "Fact · Dana · You said", or "Fact · Dana · {assistant} inferred" when it was read between the lines. */
export const buildFactLine = (input: {
  subjects: string[];
  isSaid: boolean;
  assistantName: string;
  isDisputed?: boolean;
}) =>
  [
    'Fact',
    input.subjects.filter(Boolean).join(', '),
    input.isSaid ? 'You said' : `${input.assistantName} inferred`,
    input.isDisputed ? 'Two answers' : '',
  ]
    .filter(Boolean)
    .join(' · ');

/** Who stands behind a fact and the day, as a choice's detail: "You said · Nov 3", "You confirmed · Nov 3" for an inference the person kept, "{assistant} inferred · Nov 3". */
export const buildFactSource = (input: {
  stated: 'personSaid' | 'nomosInferred' | 'personCorrected';
  isConfirmed: boolean;
  assistantName: string;
  at: number;
  timeZone: string;
}) =>
  `${
    input.stated !== 'nomosInferred'
      ? 'You said'
      : input.isConfirmed
        ? 'You confirmed'
        : `${input.assistantName} inferred`
  } · ${new Date(input.at).toLocaleDateString('en-US', {
    timeZone: input.timeZone,
    month: 'short',
    day: 'numeric',
  })}`;

/** The card line for a private detail the code did not keep: one said about someone else, or one the assistant only inferred about the person. */
export const buildNotKeptLine = (input: {
  isAboutSelf: boolean;
  assistantName: string;
}) =>
  input.isAboutSelf
    ? `Not kept · ${input.assistantName} keeps private details only when you say them`
    : 'Not kept · a private detail about someone else';

/** "Noted a fact" or "Noted 2 facts", for the summary of a turn that noted some. */
export const describeFacts = (count: number) =>
  count === 0 ? null : plural(count, 'Noted a fact', `Noted ${count} facts`);

/** The skipped line for a role asked of a project the person has no active one by that name. */
export const buildProjectNotFoundLine = (name: string) =>
  `Couldn't find a project called ${name}`;

/** The result line of a role given: "Dana · key person · 💍 Wedding". */
export const buildRoleLine = (input: {
  names: string[];
  role: 'key' | 'involved' | 'mentioned';
  project: string;
}) =>
  [
    input.names.join(', '),
    input.role === 'key'
      ? 'key person'
      : input.role === 'involved'
        ? 'involved'
        : 'mentioned',
    input.project,
  ]
    .filter(Boolean)
    .join(' · ');

/** The result line of a milestone added: "Milestone · Venue booked · 💍 Wedding · Mar 3". */
export const buildMilestoneLine = (input: {
  title: string;
  project: string;
  date: number | null;
}) =>
  [
    'Milestone',
    input.title,
    input.project,
    input.date === null
      ? null
      : new Date(input.date).toLocaleDateString('en-US', {
          timeZone: 'UTC',
          month: 'short',
          day: 'numeric',
        }),
  ]
    .filter(Boolean)
    .join(' · ');

/** The skipped line for a milestone asked of a project that already holds as many as it may. */
export const buildMilestonesFullLine = (project: string, max: number) =>
  `${project} already holds ${max} milestones`;

/** "Started a project", "added 2 people to projects" and "added a milestone", for the summary of a turn that did any. */
export const describeProjects = (
  made: number,
  roles: number,
  milestones: number,
) =>
  [
    made > 0 ? 'Started a project' : null,
    roles > 0
      ? plural(
          roles,
          'Added a person to a project',
          `Added ${roles} people to projects`,
        )
      : null,
    milestones > 0
      ? plural(
          milestones,
          'Added a milestone',
          `Added ${milestones} milestones`,
        )
      : null,
  ]
    .filter(Boolean)
    .join(' and ') || null;

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

/** The result line of a note kept: "Saved a note: Cakes keep 3 days · Baking"; no topic part when it is in none. */
export const buildNoteLine = (title: string, topicNames: string[]) =>
  [`Saved a note: ${title}`, topicNames.join(', ')].filter(Boolean).join(' · ');

/** The result line of a note the person filed by answering: "Filed a note: Cakes keep 3 days · Kitchen, Baking". */
export const buildNoteFiledLine = (title: string, topicNames: string[]) =>
  [`Filed a note: ${title}`, topicNames.join(', ')].filter(Boolean).join(' · ');

/** The line for words the person already keeps word for word. */
export const buildNoteDuplicateLine = (title: string) =>
  `Already in your notes: ${title}`;

export const NOTE_KEPT_SPOKEN = "That's already in your notes.";

export const NOTES_FULL_LINE = 'Your notes are full (1,000).';

export const NOTES_NOT_KEPT_LINE =
  'Not kept · too much to save in one go. Try the note on its own.';

/** "Changed a topic" or "Changed 2 topics": the rows show each change's own words. */
export const describeTopicChanges = (count: number) =>
  count === 0
    ? null
    : plural(count, 'Changed a topic', `Changed ${count} topics`);

/** "Saved a note" or "Saved 2 notes", for the summary of a turn that kept some. */
export const describeNotes = (count: number) =>
  count === 0 ? null : plural(count, 'Saved a note', `Saved ${count} notes`);

/** The line for photos that would not open: "Couldn't open one photo". */
export const buildPhotosNotOpenedLine = (count: number) =>
  count === 1 ? "Couldn't open one photo" : `Couldn't open ${count} photos`;

/** "Kept the photo on Venue quote", or "Kept 2 photos" when the titles differ in number from one. */
export const describeKeptPhotos = (titles: string[]) =>
  titles.length === 0
    ? null
    : titles.length === 1
      ? `Kept the photo on ${titles[0]}`
      : `Kept ${titles.length} photos`;

/** "Saved a note." or "Saved a note in Kitchen." */
export const buildSpokenNote = (topicName: string | null) =>
  topicName ? `Saved a note in ${topicName}.` : 'Saved a note.';

const WHICH_TOPIC_TITLE_CAP = 40;

/** `Where should "Cakes keep 3 days" go?`, the title cut at 40 characters. */
export const buildWhichTopicPrompt = (title: string) =>
  `Where should "${
    title.length > WHICH_TOPIC_TITLE_CAP
      ? `${title.slice(0, WHICH_TOPIC_TITLE_CAP).trimEnd()}…`
      : title
  }" go?`;

/** "Which topics should this note go in: Kitchen, Baking, or both?" */
export const buildSpokenWhichTopic = (names: string[]) =>
  `Which topics should this note go in: ${names.join(', ')}, or ${
    names.length === 2 ? 'both' : 'all of them'
  }?`;

export interface TopicCandidate {
  id: string;
  label: string;
}

/** The sealed half of the question asked when a note could go in two or more topics: one option per topic and nothing picked, with the filing held until the person answers. */
export const buildTopicQuestion = (input: {
  noteId: string;
  title: string;
  candidates: TopicCandidate[];
}) => ({
  kind: 'whichTopic' as const,
  builtBy: 'code' as const,
  shape: 'pickSeveral' as const,
  prompt: buildWhichTopicPrompt(input.title),
  options: input.candidates.map((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    detail: null,
    ref: { collection: 'topics', id: candidate.id },
  })),
  allowsSomethingElse: false,
  noneOption: false,
  recordKinds: [],
  dateMode: null,
  number: null,
  heldCommands: [{ kind: 'fileNote', noteId: input.noteId }],
  aboutRef: { collection: 'notes', id: input.noteId },
  answer: null,
});

const ADDED_TEXT_CAP = 60;

const joinNames = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** "Added to Car care: Winter tyre size": the heading of the new part, or its first words. */
export const buildTopicAddedLine = (
  topicPath: string,
  heading: string | null,
  markdown: string,
) => {
  const text = (heading ?? markdown).replace(/\s+/g, ' ').trim();
  return `Added to ${topicPath}: ${
    text.length > ADDED_TEXT_CAP
      ? `${text.slice(0, ADDED_TEXT_CAP).trimEnd()}…`
      : text
  }`;
};

/** "Changed Car care: Shortened the opening". */
export const buildTopicChangedLine = (topicPath: string, summary: string) =>
  `Changed ${topicPath}: ${summary === '' ? 'Updated the document' : summary}`;

/** "Moved Washing under Car care", or to the top level. */
export const buildTopicMovedLine = (
  topicPath: string,
  parentPath: string | null,
) =>
  parentPath === null
    ? `Moved ${topicPath} to the top level`
    : `Moved ${topicPath} under ${parentPath}`;

/** "Grouped Washing and Fragrance under Car care". */
export const buildTopicGroupedLine = (
  childPaths: string[],
  parentName: string,
) => `Grouped ${joinNames(childPaths)} under ${parentName}`;

export const buildTopicBusyLine = (topicPath: string) =>
  `${topicPath} is being written · Nothing changed`;

export const buildTopicRacedLine = (topicPath: string) =>
  `${topicPath} changed while this was made · Ask again`;

export const buildTopicUnchangedLine = (topicPath: string) =>
  `Nothing changed in ${topicPath}`;

export const buildTopicLaterLine = (topicPath: string) =>
  `Not written into ${topicPath} yet · Too much changed at once. The note waits there`;

export const buildTopicFullLine = (topicPath: string) =>
  `Not added to ${topicPath} · The document has no more room`;

export const buildTopicNotMovedLine = (
  refusal: 'unchanged' | 'self' | 'descendant' | 'tooDeep' | 'tooMany' | 'room',
  topicPath: string,
) =>
  refusal === 'unchanged'
    ? `${topicPath} is already there`
    : refusal === 'room'
      ? `Not moved · Too much changed at once to move ${topicPath}`
      : refusal === 'tooDeep' || refusal === 'tooMany'
        ? 'Not moved · Topics go three levels deep, with up to 20 subtopics each'
        : `Not moved · ${topicPath} cannot go inside itself`;

/** "Group Washing and Fragrance under Car care?", written and spoken the same. */
export const buildGroupPrompt = (childNames: string[], parentName: string) =>
  `Group ${joinNames(childNames)} under ${parentName}?`;

/** The sealed half of the question asked before a new parent topic is made: yes or don't group, with the grouping held until the person answers. */
export const buildGroupQuestion = (input: {
  name: string;
  childIds: string[];
  childNames: string[];
}) => ({
  kind: 'groupTopics' as const,
  builtBy: 'code' as const,
  shape: 'yesNo' as const,
  prompt: buildGroupPrompt(input.childNames, input.name),
  options: [
    { id: 'yes', label: 'Group them', detail: null, ref: null },
    { id: 'no', label: "Don't group", detail: null, ref: null },
  ],
  allowsSomethingElse: false,
  noneOption: false,
  recordKinds: [],
  dateMode: null,
  number: null,
  heldCommands: [
    {
      kind: 'groupTopics',
      name: input.name,
      emoji: null,
      childIds: input.childIds,
    },
  ],
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

export const WHICH_IS_TRUE_WORDS = {
  prompt: 'Which is true now?',
  noneLabel: 'Neither',
  newest: 'Newest',
};

export interface TrueCandidate {
  id: string;
  statement: string;
  detail: string;
}

/** The sealed half of the question asked when a new fact disagrees with one kept: both statements in order, then "Neither", with the two held until one is picked. */
export const buildWhichIsTrueQuestion = (input: {
  older: TrueCandidate;
  newer: TrueCandidate;
}) => ({
  kind: 'whichIsTrue' as const,
  builtBy: 'code' as const,
  shape: 'pickOne' as const,
  prompt: WHICH_IS_TRUE_WORDS.prompt,
  options: [
    ...[
      input.older,
      {
        ...input.newer,
        detail: `${input.newer.detail} · ${WHICH_IS_TRUE_WORDS.newest}`,
      },
    ].map((fact) => ({
      id: fact.id,
      label: fact.statement,
      detail: fact.detail,
      ref: { collection: 'facts', id: fact.id },
    })),
    {
      id: 'none',
      label: WHICH_IS_TRUE_WORDS.noneLabel,
      detail: null,
      ref: null,
    },
  ],
  allowsSomethingElse: false,
  noneOption: false,
  recordKinds: [],
  dateMode: null,
  number: null,
  heldCommands: [
    { kind: 'settleFact', factIds: [input.older.id, input.newer.id] },
  ],
  aboutRef: null,
  answer: null,
});

/** The card line under each fact a settled contradiction touched. */
export const SETTLE_LINES = {
  kept: 'Fact · Kept as true',
  replaced: 'Fact · No longer true',
  corrected: 'Fact · Corrected',
};

/** The execution line of a settled contradiction: "Kept “Centerpieces are $2,100”". */
export const buildSettledLine = (statement: string) =>
  `Kept \u201c${statement}\u201d`;

/** The execution line when neither was right and the person wrote the answer. */
export const buildSettledNoneLine = (statement: string) =>
  `Replaced both with \u201c${statement}\u201d`;

/** "Which is true now: Centerpieces are $1,800 or Centerpieces are $2,100?" */
export const buildSpokenWhichIsTrue = (older: string, newer: string) =>
  `Which is true now: ${older.replace(/[.!?]+$/, '')} or ${newer.replace(/[.!?]+$/, '')}?`;

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

const lowerFirst = (text: string) =>
  /^[A-Z][a-z]/.test(text)
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;

const MOMENT_WORDS: Record<string, string> = {
  passedAway: 'Passed away',
  met: 'Met',
  adopted: 'Adopted',
  startedJob: 'Started a job',
  leftJob: 'Left a job',
  moved: 'Moved',
  graduated: 'Graduated',
};

/** What a moment is called: "Met", "Passed away", or the person's own label ("Lived in Lisbon"). */
export const toMomentWord = (kind: string, label: string | null) =>
  MOMENT_WORDS[kind] ?? (label?.trim() || 'Moment');

/** What a date is called: "birthday", "anniversary", a moment's words ("met"), or the person's own label ("gotcha day"). */
export const toKeyDateName = (kind: string, label: string | null) =>
  kind === 'birthday' || kind === 'anniversary'
    ? kind
    : kind === 'custom'
      ? lowerFirst(label ?? 'date')
      : lowerFirst(toMomentWord(kind, label));

/** The result line of a moment: "Moment · Dana · Met · Mar 2015". */
export const buildMomentLine = (input: {
  owner: string | null;
  kind: string;
  label: string | null;
  when: string;
}) =>
  `Moment · ${input.owner ?? 'You'} · ${toMomentWord(input.kind, input.label)} · ${input.when}`;

/** The option id of the newly said date in a clash, apart from the 'new' a pick-one question keeps for making one. */
export const KEY_DATE_INCOMING_ID = 'incoming';

interface ClashParts {
  month: number | null;
  day: number | null;
  year: number | null;
  precision: string | null;
}

export interface KeyDateClashSide {
  label: string;
  detail: string;
}

/** The sealed half of the question asked when a different birthday or passed-away date comes for a kept one: the kept date, the new one and "Neither", with the new date held until one is picked. */
export const buildKeyDateClashQuestion = (input: {
  whoId: string;
  keyDateId: string;
  kept: KeyDateClashSide;
  next: KeyDateClashSide;
  parts: ClashParts;
  /** The kept date as it was when asked, so an answer after it changed is refused. */
  keptParts: ClashParts;
}) => ({
  kind: 'whichIsTrue' as const,
  builtBy: 'code' as const,
  shape: 'pickOne' as const,
  prompt: WHICH_IS_TRUE_WORDS.prompt,
  options: [
    {
      id: input.keyDateId,
      label: input.kept.label,
      detail: input.kept.detail,
      ref: { collection: 'keyDates', id: input.keyDateId },
    },
    {
      id: KEY_DATE_INCOMING_ID,
      label: input.next.label,
      detail: `${input.next.detail} · ${WHICH_IS_TRUE_WORDS.newest}`,
      ref: null,
    },
    {
      id: 'none',
      label: WHICH_IS_TRUE_WORDS.noneLabel,
      detail: null,
      ref: null,
    },
  ],
  allowsSomethingElse: false,
  noneOption: false,
  recordKinds: [],
  dateMode: null,
  number: null,
  heldCommands: [
    {
      kind: 'settleKeyDate',
      keyDateId: input.keyDateId,
      whoId: input.whoId,
      parts: input.parts,
      keptParts: input.keptParts,
    },
  ],
  aboutRef: { collection: 'who', id: input.whoId },
  answer: null,
});

/** The execution line of a settled date: "Kept Mum's birthday · June 3". */
export const buildSettledDateLine = (label: string) => `Kept ${label}`;

/** The result line of a date: "Added Mum's birthday: June 3", "Added your birthday: June 3". */
export const buildKeyDateLine = (input: {
  verb: 'Added' | 'Changed' | 'Removed';
  owner: string | null;
  kind: string;
  label: string | null;
  when: string | null;
}) =>
  `${input.verb} ${input.owner ? `${input.owner}'s` : 'your'} ${toKeyDateName(input.kind, input.label)}${input.when ? `: ${input.when}` : ''}`;

/** The skipped line for a date the code did not write. */
export const buildKeyDateSkipLine = (reason: string) => `Not added · ${reason}`;

/** One date's line as the summary says it: "Noted Maya's birthday: March 3", "Noted a moment for Dana: Met · Mar 2015", a removal or change as it was written. */
const toNotedLine = (line: string) => {
  const moment = /^Moment · (.+) · (.+) · (.+)$/.exec(line);
  return moment
    ? `Noted a moment for ${moment[1] === 'You' ? 'you' : moment[1]}: ${moment[2]} · ${moment[3]}`
    : line.replace(/^Added /, 'Noted ');
};

/** The summary words for a turn's dates: the one date's own line ("Noted Maya's birthday: March 3", "Removed Mum's birthday: June 3"), or "Noted 3 dates". */
export const describeKeyDates = (lines: string[]) =>
  lines.length === 0
    ? null
    : lines.length === 1
      ? toNotedLine(lines[0])
      : `Noted ${lines.length} dates`;
