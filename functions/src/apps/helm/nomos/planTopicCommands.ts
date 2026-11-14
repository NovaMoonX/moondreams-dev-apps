import type { SealedPayload } from '../../../appKeys/seal.js';
import type { Effect, EffectRef, PlannedQuestion } from './executeCommands.js';
import type {
  AddToTopicCommand,
  CreateParentTopicCommand,
  MoveTopicCommand,
  ReviseTopicCommand,
  TopicCommand,
} from './commands.js';
import {
  buildGroupPrompt,
  buildGroupQuestion,
  buildTopicAddedLine,
  buildTopicBusyLine,
  buildTopicChangedLine,
  buildTopicFullLine,
  buildTopicGroupedLine,
  buildTopicMovedLine,
  buildTopicNotMovedLine,
  buildTopicRacedLine,
  buildTopicUnchangedLine,
  buildTopicLaterLine,
} from './summaries.js';
import { decideTopic } from './policy.js';
import {
  createRefusal,
  depthAfterMove,
  moveRefusal,
  pathOf,
  type TopicPlacement,
  type TreeTopic,
} from '../topicTree.js';
import {
  applyTopicChanges,
  editablePersonSections,
  insertNomosSection,
  isClaimLive,
  type DocState,
  type TopicSection,
  type TopicSource,
} from '../topicWrite.js';
import type { LiveTopic } from '../topicVersionStore.js';

export interface PlacedTopic extends TreeTopic {
  name: string;
}

/** A note this turn makes, as a part of a topic's document may be written from it. */
export interface PlannedNote {
  id: string;
  title: string;
  topicIds: string[];
  source: TopicSource;
}

export interface PlannedVersion {
  topicId: string;
  currentVersion: number;
  sections: TopicSection[];
  reason: 'addedFromSource' | 'revisedOnRequest' | 'moved' | 'grouped';
  noteIds: string[];
  sourceCaptureId: string | null;
  changeSummary: string;
  requestQuote: string | null;
  parentName: string | null;
  docState: DocState;
  pendingNoteIds: string[];
  topicFields: Record<string, unknown> | undefined;
  executionId: string;
}

export interface PlannedEffect {
  ref: EffectRef;
  effect: Effect;
}

export interface TopicPlan {
  versions: PlannedVersion[];
  placements: TopicPlacement[];
  parentCreates: { id: string; data: Record<string, unknown> }[];
  /** `topicId:noteId` for each note whose words go straight into the topic, so it is not also filed as pending. */
  skipFiling: Set<string>;
  effects: PlannedEffect[];
  notKept: string[];
  /** The result line of each change made, for the turn's summary. */
  topicLines: string[];
  questions: PlannedQuestion[];
  /** Revisions whose topic moved on since the model read it. */
  retry: ReviseTopicCommand[];
}

interface PlanInput {
  commands: TopicCommand[];
  topics: ReadonlyMap<string, LiveTopic>;
  tree: PlacedTopic[];
  notes: PlannedNote[];
  /** The notes the turn really made; null counts every planned note. */
  madeNoteIds: ReadonlySet<string> | null;
  captureId: string;
  captureText: string;
  executionId: string;
  now: number;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  /** How many effects the turn can still record. */
  room: number;
  /** How many questions the turn can still ask. */
  questionRoom: number;
}

interface State {
  working: Map<string, LiveTopic>;
  tree: PlacedTopic[];
  plan: TopicPlan;
  room: number;
  questionRoom: number;
  hasParent: boolean;
}

const EMPTY_PLAN: TopicPlan = {
  versions: [],
  placements: [],
  parentCreates: [],
  skipFiling: new Set(),
  effects: [],
  notKept: [],
  topicLines: [],
  questions: [],
  retry: [],
};

const pathText = (tree: PlacedTopic[], id: string) =>
  pathOf(id, tree).filter(Boolean).join(' › ') ||
  (tree.find((t) => t.id === id)?.name ?? '');

const afterWrite = (docState: DocState): DocState =>
  docState === 'writing' ? 'behind' : docState;

const versionEffect = (
  topicId: string,
  change: 'added' | 'revised' | 'moved' | 'grouped',
  version: number,
  title: string,
): PlannedEffect => ({
  ref: { op: 'update', collection: 'topics', docId: topicId },
  effect: {
    written: { version: version + 1, change, 'sealed.title': title },
    previous: { version, 'sealed.title': title },
  },
});

const withPlan = (state: State, plan: Partial<TopicPlan>, used = 0): State => ({
  ...state,
  room: state.room - used,
  plan: {
    ...state.plan,
    ...plan,
  },
});

const addToTopic = (
  state: State,
  command: AddToTopicCommand,
  input: PlanInput,
): State => {
  const topic = state.working.get(command.topicId);
  const note = input.notes[command.noteIndex];
  if (!topic || !note) return state;
  if (input.madeNoteIds && !input.madeNoteIds.has(note.id)) return state;
  const path = pathText(state.tree, topic.id);
  if (isClaimLive(topic.writeClaim, input.now)) {
    return withPlan(state, {
      notKept: [...state.plan.notKept, buildTopicBusyLine(path)],
    });
  }
  if (topic.version < 1) return state;
  if (state.room < 1) {
    return withPlan(state, {
      notKept: [...state.plan.notKept, buildTopicLaterLine(path)],
    });
  }
  const inserted = insertNomosSection(
    topic.sections,
    {
      afterSectionId: command.afterSectionId,
      heading: command.heading,
      level: 2,
      markdown: command.markdown,
    },
    note.source,
    input.newId,
  );
  if ('refusal' in inserted) {
    return inserted.refusal === 'overCap'
      ? withPlan(state, {
          notKept: [...state.plan.notKept, buildTopicFullLine(path)],
        })
      : state;
  }
  const line = buildTopicAddedLine(path, command.heading, command.markdown);
  const docState = afterWrite(topic.docState);
  return withPlan(
    {
      ...state,
      working: new Map(state.working).set(topic.id, {
        ...topic,
        version: topic.version + 1,
        sections: inserted.sections,
      }),
    },
    {
      skipFiling: new Set([...state.plan.skipFiling, `${topic.id}:${note.id}`]),
      versions: [
        ...state.plan.versions,
        {
          topicId: topic.id,
          currentVersion: topic.version,
          sections: inserted.sections,
          reason: 'addedFromSource',
          noteIds: [note.id],
          sourceCaptureId: input.captureId,
          changeSummary: `Added ${(command.heading ?? line).slice(0, 60)}`,
          requestQuote: null,
          parentName: null,
          docState,
          pendingNoteIds: topic.pendingNoteIds,
          topicFields: undefined,
          executionId: input.executionId,
        },
      ],
      effects: [
        ...state.plan.effects,
        versionEffect(topic.id, 'added', topic.version, line),
      ],
      topicLines: [...state.plan.topicLines, line],
    },
    1,
  );
};

const reviseTopic = (
  state: State,
  command: ReviseTopicCommand,
  input: PlanInput,
): State => {
  const topic = state.working.get(command.topicId);
  const original = input.topics.get(command.topicId);
  if (!topic || !original) return state;
  const path = pathText(state.tree, topic.id);
  if (original.version !== command.seenVersion) {
    return withPlan(state, {
      retry: [...state.plan.retry, command],
      notKept: [...state.plan.notKept, buildTopicRacedLine(path)],
    });
  }
  if (isClaimLive(topic.writeClaim, input.now)) {
    return withPlan(state, {
      notKept: [...state.plan.notKept, buildTopicBusyLine(path)],
    });
  }
  const applied = applyTopicChanges({
    sections: topic.sections,
    changes: command.changes,
    known: new Map(),
    newId: input.newId,
    options: {
      mode: 'revise',
      editablePersonIds: editablePersonSections(
        input.captureText,
        topic.sections,
      ),
    },
  });
  if (applied.applied.length === 0 || state.room < 1) {
    return withPlan(state, {
      notKept: [...state.plan.notKept, buildTopicUnchangedLine(path)],
    });
  }
  const line = buildTopicChangedLine(path, command.changeSummary);
  return withPlan(
    {
      ...state,
      working: new Map(state.working).set(topic.id, {
        ...topic,
        version: topic.version + 1,
        sections: applied.sections,
      }),
    },
    {
      versions: [
        ...state.plan.versions,
        {
          topicId: topic.id,
          currentVersion: topic.version,
          sections: applied.sections,
          reason: 'revisedOnRequest',
          noteIds: [],
          sourceCaptureId: input.captureId,
          changeSummary:
            command.changeSummary === ''
              ? 'Changed as asked'
              : command.changeSummary,
          requestQuote: command.requestQuote,
          parentName: null,
          docState: afterWrite(topic.docState),
          pendingNoteIds: topic.pendingNoteIds,
          topicFields: undefined,
          executionId: input.executionId,
        },
      ],
      effects: [
        ...state.plan.effects,
        versionEffect(topic.id, 'revised', topic.version, line),
      ],
      topicLines: [...state.plan.topicLines, line],
    },
    1,
  );
};

const placementEffects = (
  placements: TopicPlacement[],
  before: PlacedTopic[],
  rootId: string,
  title: string,
): PlannedEffect[] =>
  placements.map((placement) => {
    const old = before.find((topic) => topic.id === placement.id);
    const isRoot = placement.id === rootId;
    return {
      ref: { op: 'update', collection: 'topics', docId: placement.id },
      effect: {
        written: isRoot
          ? {
              parentId: placement.parentId,
              depth: placement.depth,
              'sealed.title': title,
            }
          : { depth: placement.depth, 'sealed.title': title },
        previous: isRoot
          ? {
              parentId: old?.parentId ?? null,
              depth: old?.depth ?? 1,
              'sealed.title': title,
            }
          : { depth: old?.depth ?? 1, 'sealed.title': title },
      },
    };
  });

const placeTree = (tree: PlacedTopic[], placements: TopicPlacement[]) => {
  const by = new Map(placements.map((placement) => [placement.id, placement]));
  return tree.map((topic) => {
    const placement = by.get(topic.id);
    return placement
      ? { ...topic, parentId: placement.parentId, depth: placement.depth }
      : topic;
  });
};

/** The version a move writes for a topic with a document: the same sections, the new parent's name in it. Null for a topic with none or one being written. */
const movedVersion = (
  topic: LiveTopic | undefined,
  placement: TopicPlacement,
  reason: 'moved' | 'grouped',
  parentName: string | null,
  input: Pick<PlanInput, 'now' | 'executionId'>,
): PlannedVersion | null =>
  topic && topic.version >= 1 && !isClaimLive(topic.writeClaim, input.now)
    ? {
        topicId: topic.id,
        currentVersion: topic.version,
        sections: topic.sections,
        reason,
        noteIds: [],
        sourceCaptureId: null,
        changeSummary:
          parentName === null
            ? 'Moved to the top level'
            : reason === 'grouped'
              ? `Grouped under ${parentName}`
              : `Moved under ${parentName}`,
        requestQuote: null,
        parentName,
        docState: afterWrite(topic.docState),
        pendingNoteIds: topic.pendingNoteIds,
        topicFields: {
          parentId: placement.parentId,
          depth: placement.depth,
        },
        executionId: input.executionId,
      }
    : null;

const moveTopic = (
  state: State,
  command: MoveTopicCommand,
  input: PlanInput,
): State => {
  const refusal = moveRefusal(command.topicId, command.parentId, state.tree);
  const path = pathText(state.tree, command.topicId);
  if (refusal === 'missing') return state;
  if (refusal) {
    return withPlan(state, {
      notKept: [...state.plan.notKept, buildTopicNotMovedLine(refusal, path)],
    });
  }
  const placements = depthAfterMove(
    command.topicId,
    command.parentId,
    state.tree,
  );
  const root = placements.find((entry) => entry.id === command.topicId);
  const topic = state.working.get(command.topicId);
  const parentPath =
    command.parentId === null ? null : pathText(state.tree, command.parentId);
  const version =
    root && topic
      ? movedVersion(
          topic,
          root,
          'moved',
          command.parentId === null
            ? null
            : (state.tree.find((t) => t.id === command.parentId)?.name ?? ''),
          input,
        )
      : null;
  const used = placements.length + (version ? 1 : 0);
  if (!root || used > state.room) {
    return withPlan(state, {
      notKept: [...state.plan.notKept, buildTopicNotMovedLine('room', path)],
    });
  }
  const line = buildTopicMovedLine(path, parentPath);
  const covered = version ? [version] : [];
  return withPlan(
    {
      ...state,
      tree: placeTree(state.tree, placements),
      working: version
        ? new Map(state.working).set(topic!.id, {
            ...topic!,
            version: topic!.version + 1,
          })
        : state.working,
    },
    {
      versions: [...state.plan.versions, ...covered],
      placements: [...state.plan.placements, ...placements],
      effects: [
        ...state.plan.effects,
        ...placementEffects(placements, state.tree, command.topicId, line),
        ...(version && topic
          ? [versionEffect(topic.id, 'moved', topic.version, line)]
          : []),
      ],
      topicLines: [...state.plan.topicLines, line],
    },
    used,
  );
};

export type GroupRefusal =
  'topicGone' | 'changed' | 'full' | 'tooDeep' | 'tooMany';

export type GroupPlan =
  | { kind: 'refused'; reason: GroupRefusal }
  | {
      kind: 'grouped';
      parentId: string;
      parentCreate: { id: string; data: Record<string, unknown> };
      versions: PlannedVersion[];
      placements: TopicPlacement[];
      effects: PlannedEffect[];
      line: string;
      tree: PlacedTopic[];
    };

/** Gathers topics under a new parent made beside them: it takes the parent the most of them share, leaves out any that moved elsewhere, and refuses when fewer than two remain or a limit would break. Each topic that has a document gets a version saying where it went. */
export const planGroupTopics = (input: {
  name: string;
  childIds: string[];
  topics: ReadonlyMap<string, LiveTopic>;
  tree: PlacedTopic[];
  captureId: string | null;
  executionId: string;
  now: number;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  room: number;
}): GroupPlan => {
  const present = input.childIds.flatMap((id) => {
    const topic = input.topics.get(id);
    return topic ? [topic] : [];
  });
  if (present.length === 0) return { kind: 'refused', reason: 'topicGone' };
  const groups = present.reduce(
    (by, topic) =>
      by.set(topic.parentId, [...(by.get(topic.parentId) ?? []), topic]),
    new Map<string | null, LiveTopic[]>(),
  );
  const [shared, kept] = [...groups.entries()].reduce((best, entry) =>
    entry[1].length > best[1].length ? entry : best,
  );
  if (kept.length < 2) return { kind: 'refused', reason: 'changed' };
  const creation = createRefusal(shared, input.tree);
  if (creation) {
    return {
      kind: 'refused',
      reason: creation === 'missing' ? 'changed' : creation,
    };
  }
  const parentId = input.newId();
  const parentDepth =
    shared === null
      ? 1
      : (input.tree.find((topic) => topic.id === shared)?.depth ?? 0) + 1;
  const start = {
    tree: [
      ...input.tree,
      { id: parentId, parentId: shared, depth: parentDepth, name: input.name },
    ],
    refusal: null as GroupRefusal | null,
    steps: [] as { childId: string; placements: TopicPlacement[] }[],
  };
  const moved = kept.reduce((acc, child) => {
    if (acc.refusal) return acc;
    const refusal = moveRefusal(child.id, parentId, acc.tree);
    if (refusal) {
      return {
        ...acc,
        refusal: refusal === 'tooMany' ? 'tooMany' : 'tooDeep',
      } as typeof acc;
    }
    const placements = depthAfterMove(child.id, parentId, acc.tree);
    return {
      tree: placeTree(acc.tree, placements),
      refusal: null,
      steps: [...acc.steps, { childId: child.id, placements }],
    } as typeof acc;
  }, start);
  if (moved.refusal) return { kind: 'refused', reason: moved.refusal };
  const names = kept.map((child) => pathText(input.tree, child.id));
  const line = buildTopicGroupedLine(names, input.name);
  const versions = moved.steps.flatMap((step) => {
    const root = step.placements.find((entry) => entry.id === step.childId);
    const version = root
      ? movedVersion(
          input.topics.get(step.childId),
          root,
          'grouped',
          input.name,
          input,
        )
      : null;
    return version ? [version] : [];
  });
  const placements = moved.steps.flatMap((step) => step.placements);
  const effects: PlannedEffect[] = [
    {
      ref: { op: 'create', collection: 'topics', docId: parentId },
      effect: {
        written: {
          'sealed.title': line,
          'sealed.name': input.name,
          parentId: shared,
        },
        previous: null,
      },
    },
    ...moved.steps.flatMap((step) => [
      ...placementEffects(step.placements, input.tree, step.childId, line),
      ...(versions.some((version) => version.topicId === step.childId)
        ? [
            versionEffect(
              step.childId,
              'grouped',
              input.topics.get(step.childId)?.version ?? 0,
              line,
            ),
          ]
        : []),
    ]),
  ];
  if (effects.length > input.room) return { kind: 'refused', reason: 'full' };
  return {
    kind: 'grouped',
    parentId,
    parentCreate: {
      id: parentId,
      data: {
        parentId: shared,
        depth: parentDepth,
        projectIds: [],
        version: 0,
        docState: 'empty',
        pendingNoteIds: [],
        writeClaim: null,
        overviewOf: {},
        createdBy: 'nomos',
        executionId: input.executionId,
        createdAt: input.now,
        lastEditedAt: null,
        lastWrittenAt: null,
        sealed: input.seal({
          name: input.name,
          emoji: null,
          overview: null,
          sections: [],
        }),
      },
    },
    versions,
    placements,
    effects,
    line,
    tree: moved.tree,
  };
};

const createParent = (
  state: State,
  command: CreateParentTopicCommand,
  input: PlanInput,
): State => {
  const children = command.childIds.flatMap((id) => {
    const topic = state.working.get(id);
    return topic ? [topic] : [];
  });
  if (children.length < 2) return state;
  if (decideTopic(command) === 'propose') {
    if (state.questionRoom < 1) return state;
    const names = children.map((child) => pathText(state.tree, child.id));
    return {
      ...state,
      questionRoom: state.questionRoom - 1,
      plan: {
        ...state.plan,
        questions: [
          ...state.plan.questions,
          {
            id: input.newId(),
            state: {
              kind: 'groupTopics',
              shape: 'yesNo',
              askedAt: input.now,
              answeredAt: null,
              skippedAt: null,
              leftAt: null,
            },
            sealed: buildGroupQuestion({
              name: command.name,
              childIds: children.map((child) => child.id),
              childNames: names,
            }),
            spoken: buildGroupPrompt(names, command.name),
          },
        ],
      },
    };
  }
  if (state.hasParent) return state;
  const grouped = planGroupTopics({
    name: command.name,
    childIds: children.map((child) => child.id),
    topics: state.working,
    tree: state.tree,
    captureId: input.captureId,
    executionId: input.executionId,
    now: input.now,
    newId: input.newId,
    seal: input.seal,
    room: state.room,
  });
  if (grouped.kind === 'refused') return state;
  return withPlan(
    { ...state, tree: grouped.tree, hasParent: true },
    {
      versions: [...state.plan.versions, ...grouped.versions],
      placements: [...state.plan.placements, ...grouped.placements],
      parentCreates: [...state.plan.parentCreates, grouped.parentCreate],
      effects: [...state.plan.effects, ...grouped.effects],
      topicLines: [...state.plan.topicLines, grouped.line],
    },
    grouped.effects.length,
  );
};

/** What a reply's topic commands do, in order, against the topics as the transaction read them. Nothing here writes: every change is returned for the caller to write in one transaction with the turn's Execution. A command that cannot run says why in `notKept` and changes nothing. */
export const planTopicCommands = (input: PlanInput): TopicPlan => {
  const tree = input.tree.map((topic) => ({
    ...topic,
    name: input.topics.get(topic.id)?.name ?? topic.name,
  }));
  const start: State = {
    working: new Map(input.topics),
    tree,
    plan: EMPTY_PLAN,
    room: input.room,
    questionRoom: input.questionRoom,
    hasParent: false,
  };
  const end = input.commands.reduce<State>((state, command) => {
    if (command.kind === 'addToTopic') return addToTopic(state, command, input);
    if (command.kind === 'reviseTopic') {
      return reviseTopic(state, command, input);
    }
    if (command.kind === 'moveTopic') return moveTopic(state, command, input);
    return createParent(state, command, input);
  }, start);
  const covered = new Set(
    end.plan.versions.flatMap((version) =>
      version.topicFields ? [version.topicId] : [],
    ),
  );
  return {
    ...end.plan,
    placements: end.plan.placements.filter(
      (placement) => !covered.has(placement.id),
    ),
  };
};
