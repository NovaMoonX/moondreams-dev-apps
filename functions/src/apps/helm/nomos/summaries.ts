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

/** "Made a procedure" or "Made 2 procedures", then "Changed a procedure" or "Changed 2 procedures". */
export const describeProcedureChanges = (made: number, changed: number) =>
  [
    made === 0
      ? null
      : plural(made, 'Made a procedure', `Made ${made} procedures`),
    changed === 0
      ? null
      : plural(changed, 'Changed a procedure', `Changed ${changed} procedures`),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ') || null;

/** "New procedure: Packing for a work trip · 12 steps". */
export const buildProcedureMadeLine = (title: string, stepCount: number) =>
  `New procedure: ${title} · ${plural(stepCount, '1 step', `${stepCount} steps`)}`;

/** "Changed Packing for a work trip: added the laptop charger". */
export const buildProcedureChangedLine = (title: string, summary: string) =>
  `Changed ${title}: ${summary === '' ? 'Updated the steps' : summary}`;

export const buildProcedureRacedLine = (title: string) =>
  `${title} changed while this was made · Ask again`;

export const buildProcedureUnchangedLine = (title: string) =>
  `${title} is already like that`;

export const buildProcedureFullLine = (title: string, max: number) =>
  `${title} can hold ${max} steps · Nothing changed`;

export const buildProcedureTruncatedLine = (max: number) =>
  `Kept the first ${max} steps`;

export const buildProcedureLostLine = (title: string) =>
  `${title} not changed · It would have lost steps. Ask again`;

export const buildProcedureNoStepsLine = () =>
  'No steps to make a procedure from';

/** "Packing for a work trip is already a procedure". */
export const buildProcedureExistsLine = (title: string) =>
  `${title} is already a procedure`;

export const buildProcedureRoomLine = () =>
  'Too much to save in one go · Ask again for the procedure';

export const buildProcedureGroupsLine = (name: string, max: number) =>
  `${name} wasn't kept as a group · ${max} groups at most`;

export const buildProcedureGoneLine = () => 'That procedure is gone';

/** "Started a run" or "Started 2 runs", then "Ticked a step" or "Ticked 2 steps". */
export const describeRunChanges = (started: number, ticked: number) =>
  [
    started === 0
      ? null
      : plural(started, 'Started a run', `Started ${started} runs`),
    ticked === 0
      ? null
      : plural(ticked, 'Ticked a step', `Ticked ${ticked} steps`),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ') || null;

/** "Started Packing for a work trip for Pacific Northwest Weekend", or "Started Packing for a work trip" for a run of its own. */
export const buildRunStartedLine = (title: string, label: string | null) =>
  label === null ? `Started ${title}` : `Started ${title} for ${label}`;

/** "Ticked Phone charger on Packing for a work trip", "Ticked Phone charger and Passport on …", "Ticked Phone charger, Passport and 1 more on …". */
export const buildRunTickedLine = (title: string, stepTexts: string[]) => {
  const [first = '', second = ''] = stepTexts;
  const named =
    stepTexts.length <= 2
      ? stepTexts.join(' and ')
      : `${first}, ${second} and ${stepTexts.length - 2} more`;
  return `Ticked ${named} on ${title}`;
};

/** "Packing for a work trip is already running for Pacific Northwest Weekend". */
export const buildRunExistsLine = (title: string, label: string | null) =>
  label === null
    ? `${title} is already running`
    : `${title} is already running for ${label}`;

export const buildRunNoStepsLine = (title: string) =>
  `${title} has no steps to run yet`;

export const buildRunRoomLine = () =>
  'Too much to save in one go · Ask again for the run';

export const buildRunAlreadyTickedLine = () => 'Already ticked';

export const buildRunGoneLine = () => 'That run is finished or gone';

/** "Saved a note" or "Saved 2 notes", for the summary of a turn that kept some. */
export const describeNotes = (count: number) =>
  count === 0 ? null : plural(count, 'Saved a note', `Saved ${count} notes`);

/** The line for photos that would not open: "Couldn't open one photo". */
export const buildPhotosNotOpenedLine = (count: number) =>
  count === 1 ? "Couldn't open one photo" : `Couldn't open ${count} photos`;

/** The line for a file that would not read, naming it and saying what to do about that reason. */
export const buildFileNotReadLine = (
  name: string,
  reason: 'locked' | 'unreadable' | 'tooManyPages' | 'tooLarge',
) =>
  ({
    tooLarge: `Didn't read ${name}: the files in this turn were too big together. Send it on its own.`,
    locked: `${name} is locked. Unlock it and send it again.`,
    tooManyPages: `${name} has too many pages to read. Send the pages that matter.`,
    unreadable: `Couldn't read ${name}. It may be protected or scanned too faintly.`,
  })[reason];

/** What a turn kept of what it was sent: "Kept the photo", "Kept 2 photos", "Kept the PDF" or, for mixed kinds, "Kept 3 files"; each one's own line under the card names where it went. */
export const describeKeptPhotos = (
  titles: string[],
  kinds: string[] = titles.map(() => 'photo'),
) => {
  if (titles.length === 0) return null;
  const word = kinds.every((kind) => kind === kinds[0])
    ? ({ photo: 'photo', pdf: 'PDF' } as Record<string, string>)[kinds[0]]
    : undefined;
  return titles.length === 1
    ? `Kept the ${word ?? 'file'}`
    : `Kept ${titles.length} ${word ? `${word}s` : 'files'}`;
};

/** "Kept {file} as a note", for a Markdown file kept as a note. */
export const buildFileNoteLine = (name: string) => `Kept ${name} as a note`;

/** "Made the topic {name} from {file}". */
export const buildFileTopicLine = (topic: string, name: string) =>
  `Made the topic ${topic} from ${name}`;

/** Said when a file was too long to become a topic. */
export const FILE_TOPIC_TOO_LONG_LINE =
  'Kept as a note; too long to make a topic';

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

export const joinNames = (names: string[]) =>
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
  /** Words for a name the device heard as two near ones: the question and its "new" choice. */
  heard?: { prompt: string; newLabel: string };
}) => {
  const collection = input.kind === 'whichPerson' ? 'who' : 'places';
  const words = PICK_WORDS[input.kind];
  return {
    kind: input.kind,
    builtBy: 'code' as const,
    shape: 'pickOne' as const,
    prompt: input.heard?.prompt ?? words.prompt(input.name),
    options: [
      ...input.candidates.map((candidate) => ({
        ...candidate,
        ref: { collection, id: candidate.id },
      })),
      {
        id: 'new',
        label: input.heard?.newLabel ?? words.newLabel,
        detail: null,
        ref: null,
      },
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

export const HEARD_NEW_LABEL = 'Someone else';

/** "Which Siobhan: Kelly or Doyle?": each choice without the words the heard name shares with it, when it starts with them. */
export const buildHeardPrompt = (name: string, labels: string[]) => {
  const lead = `${name.trim().toLowerCase()} `;
  const rest = labels.map((label) =>
    label.toLowerCase().startsWith(lead) && label.length > lead.length
      ? label.slice(lead.length)
      : label,
  );
  return `Which ${name}: ${joinOr(rest)}?`;
};

/** The execution line of a spelled correction: "Kept “Shivon” as how Siobhan sounds". */
export const buildSoundsLikeLine = (heard: string, name: string) =>
  `Kept \u201c${heard}\u201d as how ${name} sounds`;

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
  'That waits until a few of the open questions are answered.';

export const ALREADY_ANSWERED_LINE = 'That was already answered.';

export const NOTHING_CHANGED_LINE = 'Nothing changed.';

export const ANSWER_KEPT_LINE = 'Noted.';

const WORK_WORDS =
  /\b(added|adding|made|moved|saved|linked|set|created|booked|sent|scheduled|put|filed|kept|marked|ticked|done|on the|in the|now)\b/i;

const ACK_START =
  /^(dropped|dropping|left|leaving|skipped|skipping|no change|nothing|noted|okay|ok|understood|all right|fine|sure|not adding|won't)\b/i;

/** Whether a line only acknowledges, the one kind of line an answer that filed nothing can truthfully say. */
export const isPlainAcknowledgement = (line: string) =>
  ACK_START.test(line.trim()) && !WORK_WORDS.test(line);

/** The quiet line of an answer turn whose reply wrote nothing to show: never a claim of work when no command ran. */
export const answerQuietLine = (input: {
  commandCount: number;
  isApply: boolean;
  replyLine: string | null;
}) => {
  if (input.commandCount > 0) return NOTHING_CHANGED_LINE;
  if (!input.isApply) return null;
  return input.replyLine && isPlainAcknowledgement(input.replyLine)
    ? input.replyLine
    : ANSWER_KEPT_LINE;
};

/** Whether the model's own line may stand: nothing was dropped, held, refused, deferred or left to say in code's words. */
export const ownLineStands = (...reasons: (readonly unknown[] | boolean)[]) =>
  reasons.every((reason) =>
    typeof reason === 'boolean' ? !reason : reason.length === 0,
  );

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

/** "children" for "child", else the word with an s: how a family word reads for more than one. */
export const toKinPlural = (word: string) =>
  /child$/.test(word) ? `${word.slice(0, -5)}children` : `${word}s`;

export const KIN_WORDS = {
  yes: 'Yes',
  no: 'No',
  someoneNew: 'Someone new',
  someoneElse: 'Someone else you know',
  somethingElse: 'Something else',
  noneOfThese: 'None of these',
  skip: 'Skip',
};

interface HeldMention {
  name: string;
  kind: string;
  relation: string | null;
  species: string | null;
  organizationKind: string | null;
  kin?: { kind: string; order: string | null } | null;
}

const noRefs = {
  allowsSomethingElse: false,
  noneOption: false,
  recordKinds: [],
  dateMode: null,
  number: null,
  builtBy: 'code' as const,
  answer: null,
};

/** "Is Bubs Eli?": the nickname a turn used for someone, asked before it is saved. Yes names the person, No is `none`, Someone new makes one; the turn's links are held until it is answered. */
export const buildIsThisWhoQuestion = (input: {
  alias: string;
  who: { id: string; name: string; detail: string | null };
  mention: HeldMention;
  taskIds: string[];
}) => ({
  ...noRefs,
  kind: 'isThisWho' as const,
  shape: 'pickOne' as const,
  prompt: `Is ${input.alias} ${input.who.name}?`,
  options: [
    {
      id: input.who.id,
      label: KIN_WORDS.yes,
      detail: input.who.detail
        ? `${input.who.name}, ${input.who.detail}`
        : input.who.name,
      ref: { collection: 'who' as const, id: input.who.id },
    },
    {
      id: 'none',
      label: KIN_WORDS.no,
      detail: KIN_WORDS.someoneElse,
      ref: null,
    },
    {
      id: 'new',
      label: KIN_WORDS.someoneNew,
      detail: `Add ${input.alias} as a new person`,
      ref: null,
    },
  ],
  heldCommands: [
    {
      kind: 'linkWho',
      taskIds: input.taskIds,
      mention: input.mention,
      alias: { whoId: input.who.id, name: input.alias },
    },
  ],
  aboutRef: input.taskIds[0]
    ? { collection: 'tasks', id: input.taskIds[0] }
    : null,
});

export const buildSpokenIsThisWho = (alias: string, name: string) =>
  `Is ${alias} ${name}? Yes, no, or someone new?`;

/** "Which brother: Eli or Marcus?" when two or more fit a family word, or "Who's your brother?" as a search over the person's people when none of that kind is known: pick one (their family word is then saved) or "Add your brother" with a typed name, never the said words as a name; the turn's links are held. `words` is the kind without its order. */
export const buildWhichKinQuestion = (input: {
  words: string;
  candidates: { id: string; label: string; detail: string | null }[];
  mention: HeldMention;
  taskIds: string[];
}) => {
  const isSearch = input.candidates.length === 0;
  return {
    ...noRefs,
    kind: 'whichKin' as const,
    shape: isSearch ? ('pickRecord' as const) : ('pickOne' as const),
    recordKinds: isSearch ? ['who' as const] : [],
    prompt: isSearch
      ? `Who's your ${input.words}?`
      : `Which ${input.words}: ${joinOr(input.candidates.map((c) => c.label))}?`,
    options: isSearch
      ? [
          {
            id: 'new',
            label: `Add your ${input.words}`,
            detail: null,
            ref: null,
          },
        ]
      : [
          ...input.candidates.map((candidate) => ({
            ...candidate,
            ref: { collection: 'who' as const, id: candidate.id },
          })),
          {
            id: 'none',
            label: KIN_WORDS.somethingElse,
            detail: null,
            ref: null,
          },
        ],
    heldCommands: [
      { kind: 'linkWho', taskIds: input.taskIds, mention: input.mention },
    ],
    aboutRef: input.taskIds[0]
      ? { collection: 'tasks', id: input.taskIds[0] }
      : null,
  };
};

export const buildSpokenWhichKin = (
  words: string,
  labels: string[],
  isAdd: boolean,
) =>
  isAdd
    ? `Who's your ${words}? Say their name, or skip it for now.`
    : `Which ${words}, ${joinOr(labels.slice(0, 3))}?`;

/** The order of a family word asked against the person, kept when answered: "Is Eli younger than you?" for one, "Which of your brothers are younger than you?" for several, "Which brother is the youngest?" for the oldest or youngest. */
export const buildKinOrderQuestion = (input: {
  words: string;
  wanted: string;
  shape: 'one' | 'several' | 'extreme';
  candidates: { id: string; label: string; detail: string | null }[];
  taskIds: string[];
}) => {
  const isOne = input.shape === 'one';
  const [only] = input.candidates;
  const refOf = (id: string) => ({ collection: 'who' as const, id });
  return {
    ...noRefs,
    kind: 'kinOrder' as const,
    shape: isOne
      ? ('pickOne' as const)
      : input.shape === 'several'
        ? ('pickSeveral' as const)
        : ('pickOne' as const),
    prompt: isOne
      ? `Is ${only.label} ${input.wanted} than you?`
      : input.shape === 'several'
        ? `Which of your ${toKinPlural(input.words)} are ${input.wanted} than you?`
        : `Which ${input.words} is the ${input.wanted}?`,
    options: isOne
      ? [
          {
            id: 'yes',
            label: KIN_WORDS.yes,
            detail: `${only.label} is ${input.wanted}`,
            ref: refOf(only.id),
          },
          { id: 'no', label: KIN_WORDS.no, detail: null, ref: null },
        ]
      : [
          ...input.candidates.map((candidate) => ({
            ...candidate,
            ref: refOf(candidate.id),
          })),
          {
            id: 'none',
            label:
              input.shape === 'several'
                ? KIN_WORDS.noneOfThese
                : KIN_WORDS.somethingElse,
            detail: null,
            ref: null,
          },
        ],
    heldCommands: [
      {
        kind: 'settleKin',
        taskIds: input.taskIds,
        whoIds: input.candidates.map((candidate) => candidate.id),
        wanted: input.wanted,
        mode: input.shape,
      },
    ],
    aboutRef: input.taskIds[0]
      ? { collection: 'tasks', id: input.taskIds[0] }
      : null,
  };
};

export const buildSpokenKinOrder = (
  question: ReturnType<typeof buildKinOrderQuestion>,
) =>
  question.shape === 'pickSeveral'
    ? `${question.prompt} You can say more than one.`
    : question.options.length === 2 && question.options[0].id === 'yes'
      ? question.prompt
      : `${question.prompt} ${joinOr(
          question.options.slice(0, 3).map((option) => option.label),
        )}?`;
