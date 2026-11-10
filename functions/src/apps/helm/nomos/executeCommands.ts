import type { SealedPayload } from '../../../appKeys/seal.js';
import { MAX_EFFECTS, type NomosCommand, type TaskDue } from './commands.js';
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
  sealed: Record<string, unknown>;
}

export interface EffectRef {
  op: 'create' | 'update';
  collection: 'tasks' | 'facts';
  docId: string;
}

export interface Effect {
  written: Record<string, unknown>;
  previous: Record<string, unknown> | null;
}

export interface WritePlan {
  creates: { id: string; data: Record<string, unknown> }[];
  updates: { id: string; data: Record<string, unknown> }[];
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
}

interface Draft {
  id: string;
  title: string;
  due: TaskDue | null;
  isUrgent: boolean;
  status: 'open' | 'done';
}

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

  const record = (
    docId: string,
    op: EffectRef['op'],
    written: Record<string, unknown>,
    previous: Record<string, unknown> | null,
  ) => {
    effectRefs.push({ op, collection: 'tasks', docId });
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
    if (title === null && due === undefined && isUrgent === null) return;
    const written: Record<string, unknown> = {
      'sealed.title': title ?? current.title,
      ...(due !== undefined && { due }),
      ...(isUrgent !== null && { isUrgent }),
    };
    const previous: Record<string, unknown> = {
      'sealed.title': current.title,
      ...(due !== undefined && { due: current.due }),
      ...(isUrgent !== null && { isUrgent: current.isUrgent }),
    };
    record(id, 'update', written, previous);
    patch(id, {
      ...(title !== null && {
        sealed: seal({ ...current.sealed, title }),
      }),
      ...(due !== undefined && { due }),
      ...(isUrgent !== null && { isUrgent }),
      lastEditedAt: now,
    });
    working.set(id, {
      ...current,
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
        whoIds: [],
        placeIds: [],
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

  return {
    creates,
    updates: [...patches.entries()].map(([id, data]) => ({ id, data })),
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
    return ref.op === 'create'
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
