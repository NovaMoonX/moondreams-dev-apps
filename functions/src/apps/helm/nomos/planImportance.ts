import type { SealedPayload } from '../../../appKeys/seal.js';
import type { ImportanceRecord } from '../importanceStore.js';
import type { SetImportanceCommand } from './commands.js';
import type { Effect, EffectRef, PlannedQuestion } from './executeCommands.js';
import {
  applyImportance,
  findImportanceTie,
  readImportanceOrder,
  withPlaceChanges,
  type ImportanceItem,
  type ImportancePlace,
} from './importanceOrder.js';
import {
  baseQuestion,
  buildHabitAnswerExecution,
  toPlannedQuestion,
} from './planHabitCommands.js';
import type { QuestionStateEntry } from './executeCommands.js';

const PRIVATE_ITEM = 'a private item';
const ROOM_LINE = 'Not kept · too much to save in one go';
const MAX_SPOKEN_PLACES = 3;
const MAX_ANSWER_EFFECTS = 20;

export interface ImportancePlanInput {
  commands: SetImportanceCommand[];
  records: readonly ImportanceRecord[];
  /** Date-only UTC midnight in the person's zone. */
  today: number;
  now: number;
  captureId: string;
  /** Documents another plan of this turn writes; a place is never written over them. */
  blockedIds: ReadonlySet<string>;
  isUnattended: boolean;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  /** How many effects the turn can still record. */
  room: number;
}

export interface ImportancePlan {
  updates: {
    collection: 'projects' | 'habits';
    id: string;
    data: Record<string, unknown>;
  }[];
  effectRefs: EffectRef[];
  effects: Effect[];
  lines: string[];
  notKept: string[];
  questions: PlannedQuestion[];
  isPrivate: boolean;
}

interface Acc {
  items: ImportanceItem[];
  /** The place each changed document had before the turn, and the one it has now. */
  changed: Map<
    string,
    { before: ImportancePlace | null; now: ImportancePlace | null }
  >;
  lines: string[];
  notKept: string[];
  placed: boolean;
}

const joinNames = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** Places the said things in the person's order, one command after another, each against what the one before left; nothing is written for a thing another plan of the turn writes. */
export function planImportance(input: ImportancePlanInput): ImportancePlan {
  const byId = new Map(input.records.map((record) => [record.item.id, record]));
  const shown = (id: string) => {
    const record = byId.get(id);
    if (!record) return 'that';
    return input.isUnattended && record.isPrivate
      ? PRIVATE_ITEM
      : record.item.name;
  };
  const step = (acc: Acc, command: SetImportanceCommand): Acc => {
    const withNotKept = (line: string): Acc => ({
      ...acc,
      notKept: [...acc.notKept, line],
    });
    if (command.subjectId === null)
      return withNotKept(
        `There's no project called ${command.unknownName ?? 'that'}. Start one?`,
      );
    const subjectName = shown(command.subjectId);
    const result = applyImportance(
      readImportanceOrder(acc.items, input.today),
      {
        subjectId: command.subjectId,
        relation: command.relation,
        otherId: command.otherId,
        words: command.words === '' ? null : command.words,
        until: command.until,
        captureId: input.captureId,
      },
      input.now,
    );
    if (result.kind === 'refused')
      return withNotKept(
        `${shown(result.id)} is always kept, so it doesn't need a place`,
      );
    if (result.kind === 'missing')
      return withNotKept(`${shown(result.id)} is no longer there`);
    if (result.kind === 'unchanged')
      return withNotKept(
        result.reason === 'already'
          ? `${subjectName} is already there`
          : `Say where ${shown(command.otherId ?? '')} goes first`,
      );
    const fresh = result.changes.filter(({ id }) => !acc.changed.has(id));
    if (result.changes.some(({ id }) => input.blockedIds.has(id)))
      return withNotKept(
        `${subjectName} is being changed another way, so its place stays`,
      );
    if (acc.changed.size + fresh.length > input.room)
      return withNotKept(ROOM_LINE);
    const changed = new Map(acc.changed);
    result.changes.forEach(({ id, place }) =>
      changed.set(id, {
        before: changed.get(id)?.before ?? byId.get(id)?.item.place ?? null,
        now: place,
      }),
    );
    const standing = {
      ...acc,
      items: withPlaceChanges(acc.items, result.changes),
      changed,
    };
    if (command.relation === 'canWait')
      return {
        ...standing,
        lines: [...acc.lines, `${subjectName} can wait now`],
      };
    if (command.relation === 'clear')
      return {
        ...standing,
        lines: [...acc.lines, `${subjectName} has no place now`],
      };
    return { ...standing, placed: true };
  };
  const done = input.commands.reduce<Acc>(step, {
    items: input.records.map((record) => record.item),
    changed: new Map(),
    lines: [],
    notKept: [],
    placed: false,
  });
  const order = readImportanceOrder(done.items, input.today);
  const places = order.inOrder.reduce<string[][]>(
    (groups, row) =>
      row.position === null
        ? groups
        : [
            ...groups.slice(0, row.position - 1),
            [...(groups[row.position - 1] ?? []), shown(row.id)],
          ],
    [],
  );
  const sentence = done.placed
    ? places.length === 0
      ? null
      : places
          .slice(0, MAX_SPOKEN_PLACES)
          .map((names, index) =>
            index === 0
              ? names.length > 1
                ? `${joinNames(names)} are first now`
                : `${names[0]} comes first now`
              : `then ${joinNames(names)}`,
          )
          .join(', ')
    : null;
  const tie = findImportanceTie(order, new Set(done.changed.keys()));
  const prompt =
    tie &&
    (tie.isTop
      ? `${joinNames(tie.ids.map(shown))} are all first right now. Which comes first?`
      : 'Which of these comes before the others?');
  const asked = {
    ...baseQuestion,
    kind: 'whichComesFirst' as const,
    shape: 'pickOne' as const,
    prompt: prompt ?? '',
    options: (tie?.ids ?? []).map((id) => ({ id, label: shown(id) })),
    heldCommands: [{ kind: 'whichComesFirst', ids: tie?.ids ?? [] }],
  };
  const question =
    tie && prompt && !input.isUnattended
      ? [toPlannedQuestion(asked, { id: input.newId(), now: input.now })]
      : [];
  const changes = [...done.changed.entries()].flatMap(([id, change]) => {
    const record = byId.get(id);
    return record ? [{ id, record, change }] : [];
  });
  return {
    updates: changes.map(({ id, record, change }) => ({
      collection: record.collection,
      id,
      data: {
        sealed: input.seal({ ...record.words, importance: change.now }),
        lastEditedAt: input.now,
      },
    })),
    effectRefs: changes.map(({ id, record }) => ({
      op: 'update',
      collection: record.collection,
      docId: id,
    })),
    effects: changes.map(({ record, change }) => ({
      written: {
        'sealed.importance': change.now,
        lastEditedAt: input.now,
        'sealed.title': record.item.name,
      },
      previous: {
        'sealed.importance': change.before,
        lastEditedAt: record.lastEditedAt,
        'sealed.title': record.item.name,
      },
    })),
    lines: [...done.lines, ...(sentence ? [sentence] : [])],
    notKept: done.notKept,
    questions: question,
    isPrivate: changes.some(({ record }) => record.isPrivate),
  };
}

export interface ImportanceResolveInput {
  captureId: string;
  questionId: string;
  optionId: string;
  by: 'tap' | 'voice';
  now: number;
  executionId: string;
  records: readonly ImportanceRecord[];
  today: number;
  capture: {
    status: string;
    executionIds: string[];
    questionState: Record<string, QuestionStateEntry>;
  };
  opened: Record<string, unknown>;
  seal: ImportancePlanInput['seal'];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Decides what answering "Which comes first?" writes, without touching a database: the pick is placed above the others it was tied with, against the order as it is now, and the question is closed either way. */
export function planResolveImportance(input: ImportanceResolveInput):
  | { refused: 'answered' | 'unknown' | 'gone' }
  | {
      refused: null;
      plan: ImportancePlan | null;
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
  const held = Array.isArray(question.heldCommands)
    ? question.heldCommands.find(isRecord)
    : null;
  const ids =
    held && Array.isArray(held.ids)
      ? held.ids.filter((id): id is string => typeof id === 'string')
      : [];
  if (!ids.includes(optionId)) return { refused: 'unknown' };
  const plan = planImportance({
    commands: ids
      .filter((id) => id !== optionId)
      .map((id) => ({
        kind: 'setImportance' as const,
        subjectId: optionId,
        unknownName: null,
        relation: 'above' as const,
        otherId: id,
        words: '',
        until: null,
      })),
    records: input.records,
    today: input.today,
    now,
    captureId: input.captureId,
    blockedIds: new Set(),
    isUnattended: false,
    newId: () => input.executionId,
    seal: input.seal,
    room: MAX_ANSWER_EFFECTS,
  });
  const execution =
    plan.effects.length > 0
      ? buildHabitAnswerExecution(plan, {
          captureId: input.captureId,
          questionId,
          now,
          seal: input.seal,
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
    plan: execution ? plan : null,
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
        !isOpen && capture.status === 'needsYou' ? 'sorted' : capture.status,
      executionIds: execution
        ? [...capture.executionIds, input.executionId]
        : capture.executionIds,
    },
  };
}
