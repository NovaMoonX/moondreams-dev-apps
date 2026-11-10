import type { SealedPayload } from '../../../appKeys/seal.js';
import type { MentionRead } from './commands.js';
import {
  buildPlaceDoc,
  buildWhoDoc,
  toNameCase,
  type Effect,
  type EffectRef,
  type QuestionStateEntry,
} from './executeCommands.js';
import { AUTOMATIC_LEVEL } from './policy.js';
import { getDayIn, toKnownZone } from './spoken.js';
import { readWhoTier, type WhoTierValue } from './whoTier.js';

export interface ResolveTask {
  title: string;
  whoIds: string[];
  placeIds: string[];
}

export interface ResolveInput {
  captureId: string;
  questionId: string;
  optionId: string;
  by: 'tap' | 'voice';
  now: number;
  timeZone: string;
  executionId: string;
  capture: {
    status: string;
    createdAt: number;
    whoIds: string[];
    placeIds: string[];
    executionIds: string[];
    questionState: Record<string, QuestionStateEntry>;
  };
  /** The capture's opened payload. */
  opened: Record<string, unknown>;
  /** The tasks that still exist and open, by id. */
  tasks: Map<string, ResolveTask>;
  /** The who or place the option names, or null when it is gone; its tier and last mention are read. */
  chosen: {
    tier: WhoTierValue;
    tierSetBy: 'person' | 'nomos';
    lastMentionedAt: number | null;
  } | null;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}

export type ResolveRefusal = 'answered' | 'unknown' | 'gone';

export interface ResolvePlan {
  taskUpdates: { id: string; data: Record<string, unknown> }[];
  whoCreate: { id: string; data: Record<string, unknown> } | null;
  placeCreate: { id: string; data: Record<string, unknown> } | null;
  whoUpdate: { id: string; data: Record<string, unknown> } | null;
  execution: Record<string, unknown> | null;
  capture: Record<string, unknown>;
}

interface PickOption {
  id: string;
  label: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isHeld = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && Array.isArray(value.taskIds);

const isOption = (value: unknown): value is PickOption =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.label === 'string';

/** Whether the option is a person or place the question listed, rather than "new" or "none". */
const isRecordOption = (optionId: string) =>
  optionId !== 'new' && optionId !== 'none';

const hasNewDetails = (held: Record<string, unknown>, isPlace: boolean) =>
  isPlace
    ? isRecord(held.place) &&
      typeof held.place.name === 'string' &&
      held.place.name.trim() !== ''
    : isRecord(held.mention) &&
      typeof held.mention.name === 'string' &&
      held.mention.name.trim() !== '';

/** Decides what answering a "which one?" question writes, without touching a database: a pick links the held tasks, "new" makes the person or place first, "none" links nothing, and an answered or unknown question is refused. */
export function planResolve(
  input: ResolveInput,
): { refused: ResolveRefusal } | { refused: null; plan: ResolvePlan } {
  const { questionId, optionId, now, capture } = input;
  const state = capture.questionState[questionId];
  const oldQuestions = isRecord(input.opened.questions)
    ? input.opened.questions
    : {};
  const question = oldQuestions[questionId];
  if (!state || !isRecord(question)) return { refused: 'unknown' };
  if (state.answeredAt !== null) return { refused: 'answered' };
  const options = Array.isArray(question.options)
    ? question.options.filter(isOption)
    : [];
  const held = Array.isArray(question.heldCommands)
    ? question.heldCommands.find(isHeld)
    : null;
  if (!options.some((option) => option.id === optionId) || !held) {
    return { refused: 'unknown' };
  }
  const isPlace = held.kind === 'linkPlace';
  if (optionId === 'new' && !hasNewDetails(held, isPlace)) {
    return { refused: 'unknown' };
  }
  if (isRecordOption(optionId) && !input.chosen) return { refused: 'gone' };

  const field = isPlace ? 'placeIds' : 'whoIds';
  const liveTasks = (held.taskIds as unknown[]).flatMap((id) =>
    typeof id === 'string' && input.tasks.has(id)
      ? [{ id, task: input.tasks.get(id) as ResolveTask }]
      : [],
  );
  const isLinking = optionId !== 'none' && liveTasks.length > 0;
  const mention = isRecord(held.mention)
    ? (held.mention as unknown as MentionRead)
    : null;
  const placeName = isRecord(held.place) ? String(held.place.name ?? '') : '';
  const targetId = !isLinking
    ? null
    : optionId === 'new'
      ? input.newId()
      : optionId;
  const toLink = liveTasks.filter(
    ({ task }) => targetId !== null && !task[field].includes(targetId),
  );
  const name = isPlace
    ? toNameCase(placeName)
    : toNameCase(mention?.name ?? '');

  const effects = toLink.map(({ id, task }) => ({
    ref: { op: 'update', collection: 'tasks', docId: id } as EffectRef,
    effect: {
      written: {
        'sealed.title': task.title,
        [field]: [...task[field], targetId],
      },
      previous: { 'sealed.title': task.title, [field]: task[field] },
    } as Effect,
  }));
  const taskUpdates = toLink.map(({ id, task }) => ({
    id,
    data: { [field]: [...task[field], targetId], lastEditedAt: now },
  }));

  const isNew = isLinking && optionId === 'new';
  const dayKey = String(
    getDayIn(capture.createdAt, toKnownZone(input.timeZone)),
  );
  const newTier = readWhoTier({
    tier: 'passing',
    tierSetBy: 'nomos',
    mentionDayKeys: [dayKey],
    taskLinkCount: liveTasks.length,
    hasRole: false,
  });
  const whoCreate =
    isNew && !isPlace && mention && targetId
      ? {
          id: targetId,
          data: buildWhoDoc({
            mention,
            name,
            tier: newTier,
            executionId: input.executionId,
            lastMentionedAt: capture.createdAt,
            now,
            seal: input.seal,
          }),
        }
      : null;
  const placeCreate =
    isNew && isPlace && targetId
      ? {
          id: targetId,
          data: buildPlaceDoc({
            name,
            executionId: input.executionId,
            now,
            seal: input.seal,
          }),
        }
      : null;
  const created = whoCreate ?? placeCreate;
  const createEffects =
    created && whoCreate
      ? [
          {
            ref: {
              op: 'create',
              collection: 'who',
              docId: whoCreate.id,
            } as EffectRef,
            effect: {
              written: {
                'sealed.name': name,
                kind: mention?.kind,
                tier: newTier,
              },
              previous: null,
            } as Effect,
          },
        ]
      : created
        ? [
            {
              ref: {
                op: 'create',
                collection: 'places',
                docId: created.id,
              } as EffectRef,
              effect: { written: { 'sealed.name': name }, previous: null },
            },
          ]
        : [];

  const chosen = input.chosen;
  const tier =
    chosen && !isPlace && isLinking && targetId === optionId
      ? readWhoTier({
          ...chosen,
          mentionDayKeys: [dayKey],
          taskLinkCount: liveTasks.length,
          hasRole: false,
        })
      : null;
  const whoUpdate =
    chosen && !isPlace && isLinking && targetId === optionId
      ? {
          id: targetId,
          data: {
            lastMentionedAt: Math.max(
              capture.createdAt,
              chosen.lastMentionedAt ?? 0,
            ),
            ...(tier && tier !== chosen.tier && { tier }),
          },
        }
      : null;

  const allEffects = [...effects, ...createEffects];
  const label = isRecordOption(optionId)
    ? (options.find((option) => option.id === optionId)?.label ?? name)
    : name;
  const [first] = liveTasks;
  const summary =
    liveTasks.length === 1
      ? `Linked ${label} to ${first.task.title}`
      : `Linked ${label} to ${liveTasks.length} tasks`;
  const execution =
    allEffects.length === 0
      ? null
      : {
          captureId: input.captureId,
          actor: 'nomos',
          category: 'organize',
          autonomyLevel: AUTOMATIC_LEVEL,
          state: 'succeeded',
          effectRefs: allEffects.map(({ ref }) => ref),
          linkedWhoIds: isPlace || !targetId ? [] : [targetId],
          linkedPlaceIds: isPlace && targetId ? [targetId] : [],
          undoesExecutionId: null,
          undoneByExecutionId: null,
          questionRef: {
            captureId: input.captureId,
            questionId,
          },
          errorCode: null,
          createdAt: now,
          decidedAt: now,
          finishedAt: now,
          sealed: input.seal({
            summary,
            commands: [],
            effects: allEffects.map(({ effect }) => effect),
            undoReport: null,
            goneIds: null,
            spoken: null,
          }),
        };

  const questionState = {
    ...capture.questionState,
    [questionId]: { ...state, answeredAt: now },
  };
  const isOpen = Object.values(questionState).some(
    (entry) => entry.answeredAt === null,
  );
  const union = (left: string[], right: string[]) => [
    ...new Set([...left, ...right]),
  ];
  return {
    refused: null,
    plan: {
      taskUpdates,
      whoCreate,
      placeCreate,
      whoUpdate,
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
        ...(targetId &&
          !isPlace && { whoIds: union(capture.whoIds, [targetId]) }),
        ...(targetId &&
          isPlace && {
            placeIds: union(capture.placeIds, [targetId]),
          }),
        executionIds: execution
          ? [...capture.executionIds, input.executionId]
          : capture.executionIds,
      },
    },
  };
}
