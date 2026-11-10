import type { SealedPayload } from '../../../appKeys/seal.js';
import { toDisplayCase } from '../../../vendor/optionMatchUtils.js';
import {
  MAX_EFFECTS,
  type MentionRead,
  type NomosCommand,
  type PlaceRead,
  type TaskDue,
} from './commands.js';
import {
  matchPlaces,
  matchWho,
  type KnownPlace,
  type KnownWho,
} from './matchEntities.js';
import { readWhoTier, type WhoTierValue } from './whoTier.js';
import { summarizeAnswer, type CaptureAnswer } from './answerGuards.js';
import { AUTOMATIC_LEVEL } from './policy.js';
import { buildSpokenAck } from './spoken.js';
import {
  buildCodeQuestion,
  summarize,
  type CodeQuestionKind,
  type EffectCounts,
} from './summaries.js';

export interface ExistingTask {
  status: 'open' | 'done';
  due: TaskDue | null;
  isUrgent: boolean;
  title: string;
  whoIds: string[];
  placeIds: string[];
  sealed: Record<string, unknown>;
}

/** A who the person already has, with what the tier rule reads about it. */
export interface KnownWhoState extends KnownWho {
  tier: WhoTierValue;
  tierSetBy: 'person' | 'nomos';
  mentionDayKeys: string[];
  taskLinkCount: number;
  hasRole: boolean;
}

/** The people and places a turn names, with what the person already has to match them against. */
export interface PeopleInput {
  mentions: MentionRead[];
  places: PlaceRead[];
  known: KnownWhoState[];
  knownPlaces: KnownPlace[];
  assistantName: string | null;
  /** The day the capture was made, in the person's zone. */
  dayKey: string;
  capturedAt: number;
}

export interface EffectRef {
  op: 'create' | 'update';
  collection: 'tasks' | 'facts' | 'who' | 'places';
  docId: string;
}

export interface Effect {
  written: Record<string, unknown>;
  previous: Record<string, unknown> | null;
}

export interface WritePlan {
  creates: { id: string; data: Record<string, unknown> }[];
  updates: { id: string; data: Record<string, unknown> }[];
  whoCreates: { id: string; data: Record<string, unknown> }[];
  whoUpdates: { id: string; data: Record<string, unknown> }[];
  placeCreates: { id: string; data: Record<string, unknown> }[];
  /** Every person, pet or organization and place the turn linked, matched or made. */
  linkedWhoIds: string[];
  linkedPlaceIds: string[];
  effectRefs: EffectRef[];
  effects: Effect[];
  counts: EffectCounts;
}

interface PlanInput {
  commands: NomosCommand[];
  existing: Map<string, ExistingTask>;
  captureId: string;
  executionId: string;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  newId: () => string;
  people?: PeopleInput;
}

interface Draft {
  id: string;
  title: string;
  whoIds: string[];
  placeIds: string[];
  due: TaskDue | null;
  isUrgent: boolean;
  status: 'open' | 'done';
}

const union = (left: string[], right: string[]) => [
  ...new Set([...left, ...right]),
];

const NAME_CASE = {
  style: 'title',
  keepAcronyms: true,
  keepMixedCase: true,
} as const;

/** Each mention's and place's ref to the id it links: a sure match keeps its id, a new one gets a fresh id, an unsure one or the assistant's own name links nothing. */
function settleEntities(input: PlanInput) {
  const people = input.people;
  const empty = {
    whoIdOf: new Map<string, string>(),
    placeIdOf: new Map<string, string>(),
    newWho: [] as { id: string; mention: MentionRead }[],
    newPlaces: [] as { id: string; place: PlaceRead }[],
  };
  if (!people) return empty;
  const whoMatches = matchWho({
    mentions: people.mentions,
    known: people.known,
    assistantName: people.assistantName,
  });
  const placeMatches = matchPlaces({
    names: people.places.map((place) => place.name),
    known: people.knownPlaces,
    assistantName: people.assistantName,
  });
  const whoSettled = people.mentions.flatMap((mention, index) => {
    const match = whoMatches[index];
    return match.kind === 'match'
      ? [{ mention, id: match.id, isNew: false }]
      : match.kind === 'new'
        ? [{ mention, id: input.newId(), isNew: true }]
        : [];
  });
  const placeSettled = people.places.flatMap((place, index) => {
    const match = placeMatches[index];
    return match.kind === 'match'
      ? [{ place, id: match.id, isNew: false }]
      : match.kind === 'new'
        ? [{ place, id: input.newId(), isNew: true }]
        : [];
  });
  return {
    whoIdOf: new Map(whoSettled.map((entry) => [entry.mention.ref, entry.id])),
    placeIdOf: new Map(
      placeSettled.map((entry) => [entry.place.ref, entry.id]),
    ),
    newWho: whoSettled
      .filter((entry) => entry.isNew)
      .map(({ id, mention }) => ({ id, mention })),
    newPlaces: placeSettled
      .filter((entry) => entry.isNew)
      .map(({ id, place }) => ({ id, place })),
  };
}

const idsOf = (refs: string[], idOf: Map<string, string>) => [
  ...new Set(refs.flatMap((ref) => idOf.get(ref) ?? [])),
];

const isSameDue = (a: TaskDue | null, b: TaskDue | null) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Turns settled commands into the documents to write and the Execution's record of each change; an update to a task made in the same reply folds into that task's create. */
export function planWrites(input: PlanInput): WritePlan {
  const { existing, now, seal } = input;
  const drafts = new Map<string, Draft>();
  const working = new Map<string, ExistingTask>(existing);
  const patches = new Map<string, Record<string, unknown>>();
  const effectRefs: EffectRef[] = [];
  const effects: Effect[] = [];
  const counts: EffectCounts = { made: 0, updated: 0, completed: 0 };

  const entities = settleEntities(input);

  const record = (
    docId: string,
    op: EffectRef['op'],
    written: Record<string, unknown>,
    previous: Record<string, unknown> | null,
    collection: EffectRef['collection'] = 'tasks',
  ) => {
    effectRefs.push({ op, collection, docId });
    effects.push({ written, previous });
  };

  const patch = (id: string, data: Record<string, unknown>) =>
    patches.set(id, { ...patches.get(id), ...data });

  input.commands.forEach((command) => {
    if (effects.length + drafts.size >= MAX_EFFECTS) return;
    if (command.kind === 'createTask') {
      const id = input.newId();
      drafts.set(command.ref, {
        id,
        title: command.title,
        whoIds: idsOf(command.whoRefs, entities.whoIdOf),
        placeIds: idsOf(command.placeRefs, entities.placeIdOf),
        due: command.due,
        isUrgent: command.isUrgent,
        status: 'open',
      });
      return;
    }
    const draft = drafts.get(command.taskId);
    if (draft) {
      if (command.kind === 'completeTask') draft.status = 'done';
      else {
        draft.title = command.title ?? draft.title;
        if (command.hasDue) draft.due = command.due;
        draft.isUrgent = command.isUrgent ?? draft.isUrgent;
        draft.whoIds = union(
          draft.whoIds,
          idsOf(command.whoRefs, entities.whoIdOf),
        );
        draft.placeIds = union(
          draft.placeIds,
          idsOf(command.placeRefs, entities.placeIdOf),
        );
      }
      return;
    }
    const current = working.get(command.taskId);
    if (!current) return;
    const id = command.taskId;

    if (command.kind === 'completeTask') {
      if (current.status === 'done') return;
      record(
        id,
        'update',
        { 'sealed.title': current.title, status: 'done', completedAt: now },
        { 'sealed.title': current.title, status: 'open', completedAt: null },
      );
      patch(id, { status: 'done', completedAt: now, lastEditedAt: now });
      working.set(id, { ...current, status: 'done' });
      counts.completed += 1;
      return;
    }

    const title =
      command.title && command.title !== current.title ? command.title : null;
    const due =
      command.hasDue && !isSameDue(command.due, current.due)
        ? command.due
        : undefined;
    const isUrgent =
      command.isUrgent !== null && command.isUrgent !== current.isUrgent
        ? command.isUrgent
        : null;
    const whoIds = union(
      current.whoIds,
      idsOf(command.whoRefs, entities.whoIdOf),
    );
    const placeIds = union(
      current.placeIds,
      idsOf(command.placeRefs, entities.placeIdOf),
    );
    const hasNewWho = whoIds.length > current.whoIds.length;
    const hasNewPlace = placeIds.length > current.placeIds.length;
    if (
      title === null &&
      due === undefined &&
      isUrgent === null &&
      !hasNewWho &&
      !hasNewPlace
    ) {
      return;
    }
    const written: Record<string, unknown> = {
      'sealed.title': title ?? current.title,
      ...(due !== undefined && { due }),
      ...(isUrgent !== null && { isUrgent }),
      ...(hasNewWho && { whoIds }),
      ...(hasNewPlace && { placeIds }),
    };
    const previous: Record<string, unknown> = {
      'sealed.title': current.title,
      ...(due !== undefined && { due: current.due }),
      ...(isUrgent !== null && { isUrgent: current.isUrgent }),
      ...(hasNewWho && { whoIds: current.whoIds }),
      ...(hasNewPlace && { placeIds: current.placeIds }),
    };
    record(id, 'update', written, previous);
    patch(id, {
      ...(title !== null && {
        sealed: seal({ ...current.sealed, title }),
      }),
      ...(due !== undefined && { due }),
      ...(isUrgent !== null && { isUrgent }),
      ...(hasNewWho && { whoIds }),
      ...(hasNewPlace && { placeIds }),
      lastEditedAt: now,
    });
    working.set(id, {
      ...current,
      whoIds,
      placeIds,
      title: title ?? current.title,
      due: due === undefined ? current.due : due,
      isUrgent: isUrgent ?? current.isUrgent,
    });
    counts.updated += 1;
  });

  const creates = [...drafts.values()].map((draft) => {
    const isDone = draft.status === 'done';
    record(
      draft.id,
      'create',
      {
        'sealed.title': draft.title,
        due: draft.due,
        isUrgent: draft.isUrgent,
        status: draft.status,
        ...(isDone && { completedAt: now }),
      },
      null,
    );
    counts.made += 1;
    return {
      id: draft.id,
      data: {
        status: draft.status,
        importance: null,
        isUrgent: draft.isUrgent,
        due: draft.due,
        durationMinutes: null,
        energy: null,
        context: null,
        projectId: null,
        milestoneId: null,
        whoIds: draft.whoIds,
        placeIds: draft.placeIds,
        notUntil: null,
        waitsOnTaskIds: [],
        waitsOnWhoId: null,
        stepState: {},
        mediaIds: [],
        createdBy: 'nomos',
        sourceCaptureId: input.captureId,
        executionId: input.executionId,
        createdAt: now,
        lastEditedAt: null,
        completedAt: isDone ? now : null,
        sealed: seal({ title: draft.title, notes: null, steps: {} }),
      },
    };
  });

  const isFiling = effects.length > 0;
  const people = input.people;
  const links = (field: 'whoIds' | 'placeIds') =>
    [
      ...creates.map(({ data }) => data[field] as string[]),
      ...[...patches.values()].flatMap((data) => {
        const ids = data[field];
        return Array.isArray(ids) ? [ids as string[]] : [];
      }),
    ].flat();
  const taskLinks = links('whoIds').reduce(
    (counts, id) => counts.set(id, (counts.get(id) ?? 0) + 1),
    new Map<string, number>(),
  );
  const newWhoIds = new Set(entities.newWho.map((entry) => entry.id));
  const whoCreates = !isFiling
    ? []
    : entities.newWho.map(({ id, mention }) => {
        const name = toDisplayCase(mention.name, NAME_CASE);
        const tier = readWhoTier({
          tier: 'passing',
          tierSetBy: 'nomos',
          mentionDayKeys: [people?.dayKey ?? ''],
          taskLinkCount: taskLinks.get(id) ?? 0,
          hasRole: false,
        });
        record(
          id,
          'create',
          { 'sealed.name': name, kind: mention.kind, tier },
          null,
          'who',
        );
        return {
          id,
          data: {
            kind: mention.kind,
            tier,
            tierSetBy: 'nomos',
            isSelf: false,
            placeIds: [],
            photoMediaId: null,
            mediaIds: [],
            importedFrom: null,
            importedFields: {},
            lastMentionedAt: people?.capturedAt ?? now,
            yearlyDateCount: 0,
            momentCount: 0,
            createdBy: 'nomos',
            executionId: input.executionId,
            createdAt: now,
            lastEditedAt: null,
            sealed: seal({
              name,
              aliases: [],
              relation: mention.relation,
              phone: null,
              email: null,
              notes: null,
              species: mention.species ? toDisplayCase(mention.species) : null,
              organizationKind: mention.organizationKind
                ? toDisplayCase(mention.organizationKind)
                : null,
            }),
          },
        };
      });
  const placeCreates = !isFiling
    ? []
    : entities.newPlaces.map(({ id, place }) => {
        const name = toDisplayCase(place.name, NAME_CASE);
        record(id, 'create', { 'sealed.name': name }, null, 'places');
        return {
          id,
          data: {
            isHome: false,
            photoMediaIds: [],
            createdBy: 'nomos',
            executionId: input.executionId,
            createdAt: now,
            lastEditedAt: null,
            sealed: seal({
              name,
              aliases: [],
              address: null,
              notes: null,
            }),
          },
        };
      });
  const whoUpdates = !isFiling
    ? []
    : [...entities.whoIdOf.values()]
        .filter((id) => !newWhoIds.has(id))
        .flatMap((id) => {
          const state = people?.known.find((entry) => entry.id === id);
          if (!state || !people) return [];
          const tier = readWhoTier({
            tier: state.tier,
            tierSetBy: state.tierSetBy,
            mentionDayKeys: [...state.mentionDayKeys, people.dayKey],
            taskLinkCount: state.taskLinkCount + (taskLinks.get(id) ?? 0),
            hasRole: state.hasRole,
          });
          return [
            {
              id,
              data: {
                lastMentionedAt: people.capturedAt,
                ...(tier !== state.tier && { tier }),
              },
            },
          ];
        });

  return {
    creates,
    updates: [...patches.entries()].map(([id, data]) => ({ id, data })),
    whoCreates,
    whoUpdates,
    placeCreates,
    linkedWhoIds: isFiling ? union([], [...entities.whoIdOf.values()]) : [],
    linkedPlaceIds: isFiling ? union([], [...entities.placeIdOf.values()]) : [],
    effectRefs,
    effects,
    counts,
  };
}

export function buildExecution(
  plan: WritePlan,
  input: Pick<PlanInput, 'captureId' | 'now' | 'seal'> & {
    commands: NomosCommand[];
    messageCount?: number;
    inputMode?: string;
    timeZone?: string;
  },
): Record<string, unknown> {
  const created = plan.effectRefs.flatMap((ref, index) => {
    const { written } = plan.effects[index];
    return ref.op === 'create' && ref.collection === 'tasks'
      ? [
          {
            title: String(written['sealed.title'] ?? ''),
            due: (written.due ?? null) as TaskDue | null,
          },
        ]
      : [];
  });
  return {
    captureId: input.captureId,
    actor: 'nomos',
    category: 'organize',
    autonomyLevel: AUTOMATIC_LEVEL,
    state: 'succeeded',
    effectRefs: plan.effectRefs,
    undoesExecutionId: null,
    undoneByExecutionId: null,
    questionRef: null,
    errorCode: null,
    createdAt: input.now,
    decidedAt: input.now,
    finishedAt: input.now,
    sealed: input.seal({
      summary: summarize(plan.counts, input.messageCount),
      commands: input.commands,
      effects: plan.effects,
      undoReport: null,
      goneIds: null,
      spoken: buildSpokenAck({
        inputMode: input.inputMode,
        counts: plan.counts,
        messageCount: input.messageCount ?? 1,
        created,
        timeZone: input.timeZone ?? 'UTC',
        now: input.now,
      }),
    }),
  };
}

/** An answer writes only the capture's sealed answer, so it has no effects and nothing to undo, unless it noted one fact: then that fact is its one effect and Undo deletes it. A refused fact is recorded as not done. */
export function buildAnswerExecution(input: {
  captureId: string;
  answer: CaptureAnswer;
  spoken: string | null;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  fact?: { effectRef: EffectRef; effect: Effect; note: string } | null;
  notDone?: string[];
}): Record<string, unknown> {
  return {
    captureId: input.captureId,
    actor: 'nomos',
    category: 'answer',
    autonomyLevel: AUTOMATIC_LEVEL,
    state: 'succeeded',
    effectRefs: input.fact ? [input.fact.effectRef] : [],
    undoesExecutionId: null,
    undoneByExecutionId: null,
    questionRef: null,
    errorCode: null,
    createdAt: input.now,
    decidedAt: input.now,
    finishedAt: input.now,
    sealed: input.seal({
      summary: input.fact
        ? `${summarizeAnswer(input.answer)} ${input.fact.note}`
        : summarizeAnswer(input.answer),
      commands: [],
      effects: input.fact ? [input.fact.effect] : [],
      notDone: input.notDone ?? [],
      undoReport: null,
      goneIds: null,
      spoken: input.spoken,
    }),
  };
}

export interface QuestionStateEntry {
  kind: string;
  shape: string;
  askedAt: number;
  answeredAt: number | null;
  skippedAt: number | null;
}

interface SettleInput {
  mode: 'full' | 'rest';
  filed: number;
  hasPlanDay?: boolean;
  hasMore: boolean;
  executionId: string | null;
  answer?: {
    executionId: string;
    sealed: CaptureAnswer;
    spoken: { text: string; priority: 'reply'; builtBy: 'code' } | null;
  } | null;
  now: number;
  newId: () => string;
  opened: Record<string, unknown>;
  questionState: Record<string, QuestionStateEntry>;
  executionIds: string[];
}

const isOpenMore = ([, entry]: [string, QuestionStateEntry]) =>
  entry.kind === 'moreToSort' && entry.answeredAt === null;

/** Whether the capture still waits on a "Sort the rest" answer. */
export const hasOpenMoreToSort = (
  questionState: Record<string, QuestionStateEntry> | undefined,
): boolean => Object.entries(questionState ?? {}).some(isOpenMore);

const asked = (kind: CodeQuestionKind, id: string, now: number) => ({
  state: {
    [id]: {
      kind,
      shape: 'pickOne',
      askedAt: now,
      answeredAt: null,
      skippedAt: null,
    },
  },
  sealed: { [id]: buildCodeQuestion(kind) },
});

/** Where a capture lands once a reading is filed: sorted, still more to sort, or nothing could be made of it. The opened payload is spread so its text and reading are never dropped. */
export function settleCapture(input: SettleInput) {
  const { now, mode, opened } = input;
  const oldQuestions = (opened.questions ?? {}) as Record<string, unknown>;
  const closing = Object.entries(input.questionState).filter(isOpenMore);
  const closedState = Object.fromEntries(
    closing.map(([id, entry]) => [id, { ...entry, answeredAt: now }]),
  );
  const closedQuestions = Object.fromEntries(
    closing.map(([id]) => [
      id,
      {
        ...(oldQuestions[id] as Record<string, unknown>),
        answer: {
          by: 'tap',
          at: now,
          turnCaptureId: null,
          shape: 'pickOne',
          optionId: 'sortRest',
          otherText: null,
        },
      },
    ]),
  );
  const isUnread =
    mode === 'full' &&
    input.filed === 0 &&
    !input.hasMore &&
    !input.answer &&
    !input.hasPlanDay;
  const next = isUnread
    ? asked('couldNotRead', input.newId(), now)
    : input.hasMore
      ? asked('moreToSort', input.newId(), now)
      : null;
  const previous =
    typeof opened.sortedThrough === 'number' ? opened.sortedThrough : 0;
  return {
    status: next ? ('needsYou' as const) : ('sorted' as const),
    questionState: { ...input.questionState, ...closedState, ...next?.state },
    sealed: {
      ...opened,
      questions: { ...oldQuestions, ...closedQuestions, ...next?.sealed },
      sortedThrough: input.hasMore
        ? previous + input.filed
        : (opened.sortedThrough ?? null),
      ...(input.answer && {
        answer: input.answer.sealed,
        spoken: input.answer.spoken,
      }),
    },
    executionIds: [
      ...input.executionIds,
      ...(input.executionId ? [input.executionId] : []),
      ...(input.answer ? [input.answer.executionId] : []),
    ],
  };
}
