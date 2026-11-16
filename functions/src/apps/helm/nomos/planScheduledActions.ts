import type { SealedPayload } from '../../../appKeys/seal.js';
import { dayKeyToMs } from '../../../vendor/cadenceUtils.js';
import {
  repeatFromParts,
  type RepeatParts,
  type Weekday,
} from '../../../vendor/repeatRule.js';
import type {
  Effect,
  EffectRef,
  PlannedQuestion,
  QuestionStateEntry,
} from './executeCommands.js';
import { baseQuestion, toPlannedQuestion } from './planHabitCommands.js';
import type {
  ChangeScheduledActionCommand,
  ScheduleActionCommand,
} from './commands.js';
import {
  CHANGE_REFUSAL_WORDS,
  MAX_SCHEDULED_ACTIONS,
  RULE_PROBLEM_WORDS,
  buildScheduleRule,
  describeScheduledRule,
  planScheduleChange,
  toDayKeyIn,
  type ActionState,
  type ScheduleChange,
} from './scheduledActions.js';
import type { ScheduleCommand, ScheduleDrop } from './readScheduledCommands.js';

export const SCHEDULE_DROP_LINES: Partial<Record<ScheduleDrop, string>> = {
  'schedule-outbound':
    "Helm can't send or add anything outside itself on a schedule yet, so that one wasn't made. It can make tasks or plan a day for you at a set time",
};

const DEFAULT_TIME = '09:00';

/** A stored scheduled action as the transaction read it, its words opened. */
export interface StoredScheduled {
  id: string;
  doc: Record<string, unknown>;
  words: {
    title: string;
    instruction: string | null;
    heldCommands: Record<string, unknown>[] | null;
  } | null;
}

export interface ScheduledPlan {
  creates: { id: string; doc: Record<string, unknown> }[];
  updates: { id: string; data: Record<string, unknown> }[];
  effectRefs: EffectRef[];
  effects: Effect[];
  lines: string[];
  notKept: string[];
  questions: PlannedQuestion[];
  isPrivate: boolean;
}

export interface ScheduledPlanInput {
  commands: ScheduleCommand[];
  stored: Map<string, StoredScheduled>;
  homeZone: string;
  weekStart?: Weekday;
  now: number;
  captureId: string;
  isAnswer?: boolean;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  /** How many effects the turn may still write. */
  room: number;
}

const EMPTY: ScheduledPlan = {
  creates: [],
  updates: [],
  effectRefs: [],
  effects: [],
  lines: [],
  notKept: [],
  questions: [],
  isPrivate: false,
};

const toDayWords = (day: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(dayKeyToMs(day));

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

/** The fields of a stored document the schedule reads, with a missing one defaulted. */
export function readActionState(doc: Record<string, unknown>): ActionState {
  const moved =
    typeof doc.moved === 'object' && doc.moved !== null
      ? Object.fromEntries(
          Object.entries(doc.moved as Record<string, unknown>).flatMap(
            ([key, value]): [string, { day: string; time: string }][] => {
              const entry = value as { day?: unknown; time?: unknown };
              return typeof entry?.day === 'string' &&
                typeof entry.time === 'string'
                ? [[key, { day: entry.day, time: entry.time }]]
                : [];
            },
          ),
        )
      : {};
  return {
    status:
      doc.status === 'paused' || doc.status === 'ended' ? doc.status : 'active',
    endedBy:
      doc.endedBy === 'person' || doc.endedBy === 'finished'
        ? doc.endedBy
        : null,
    repeat: typeof doc.repeat === 'string' ? doc.repeat : null,
    startsOn: typeof doc.startsOn === 'string' ? doc.startsOn : '',
    time: typeof doc.time === 'string' ? doc.time : DEFAULT_TIME,
    timeZone: typeof doc.timeZone === 'string' ? doc.timeZone : null,
    skipped: strings(doc.skipped),
    moved,
    nextRunAt: isNumber(doc.nextRunAt) ? doc.nextRunAt : null,
    nextRunKey: typeof doc.nextRunKey === 'string' ? doc.nextRunKey : null,
    lastRunDueAt: isNumber(doc.lastRunDueAt) ? doc.lastRunDueAt : null,
    pausedFrom: isNumber(doc.pausedFrom) ? doc.pausedFrom : null,
    pausedUntil: isNumber(doc.pausedUntil) ? doc.pausedUntil : null,
  };
}

export const countKept = (stored: Map<string, StoredScheduled>) =>
  [...stored.values()].filter((entry) => entry.doc.status !== 'ended').length;

const toRepeatParts = (command: ScheduleActionCommand): RepeatParts | null => {
  const { repeat } = command;
  if (repeat.freq === null || repeat.freq === 'subDaily') return null;
  return {
    freq: repeat.freq,
    interval: repeat.interval,
    weekdays: repeat.weekdays,
    monthBy: repeat.monthBy,
    nth: repeat.nth,
    endsKind: repeat.endsKind,
    until: repeat.until,
    count: repeat.count,
  };
};

const withRuleAt = (
  parts: RepeatParts | null,
  startsOn: string,
  weekStart: Weekday,
) => (parts ? repeatFromParts(parts, startsOn, weekStart) : null);

const heldWords = (command: ScheduleActionCommand) =>
  command.held.length > 0
    ? command.held.map((entry) =>
        entry.kind === 'createTask'
          ? { kind: 'createTask', title: entry.title }
          : { kind: entry.kind },
      )
    : null;

const clockWords = (time: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  }).format(Date.parse(`1970-01-01T${time}:00Z`));

/** The question that offers separate daily actions in place of a rule that runs more than once a day; made only on a yes. */
const buildSplitQuestion = (command: ScheduleActionCommand) => ({
  ...baseQuestion,
  kind: 'splitDaily' as const,
  shape: 'yesNo' as const,
  prompt: `Helm runs things once a day at most. Make ${command.times.length} daily actions, at ${command.times
    .map(clockWords)
    .join(' and ')}?`,
  options: [
    { id: 'yes', label: 'Yes, make them' },
    { id: 'no', label: 'No' },
  ],
  heldCommands: [
    {
      kind: 'splitDaily',
      commands: command.times.map((time) => ({
        ...command,
        repeat: {
          freq: 'daily',
          interval: 1,
          weekdays: [],
          monthBy: null,
          nth: null,
          endsKind: 'never',
          until: null,
          count: null,
        },
        time,
        times: [time],
      })),
    },
  ],
});

/** Plans each said scheduled action and each change to one, against what the person has now, with the earlier fields kept so Undo restores them. The reply's words are the rule's own line and the next three dates, never the model's. */
export function planScheduledActions(input: ScheduledPlanInput): ScheduledPlan {
  const weekStart = input.weekStart ?? 'SU';
  const today = toDayKeyIn(input.now, input.homeZone);
  const stored = new Map(input.stored);
  const step = (
    acc: ScheduledPlan,
    command: ScheduleCommand,
  ): ScheduledPlan => {
    const withNotKept = (line: string) => ({
      ...acc,
      notKept: [...acc.notKept, line],
    });
    if (acc.effects.length >= input.room) {
      return withNotKept('That was too much to schedule in one go');
    }
    if (command.kind === 'changeScheduledAction') {
      return planChange(acc, command);
    }
    if (command.repeat.freq === 'subDaily') {
      if (command.times.length < 2 || input.isAnswer) {
        return withNotKept(
          'Helm runs things once a day at most. Say the times you want ("at 8 and at 6") and it will make one daily action for each',
        );
      }
      return {
        ...acc,
        questions: [
          ...acc.questions,
          toPlannedQuestion(buildSplitQuestion(command), {
            id: input.newId(),
            now: input.now,
          }),
        ],
      };
    }
    if (countKept(stored) >= MAX_SCHEDULED_ACTIONS) {
      return withNotKept(
        `You already have ${MAX_SCHEDULED_ACTIONS} scheduled actions, the most there can be. End one in Browse › Scheduled to make room`,
      );
    }
    const startsOn = command.startsOn ?? today;
    const time = command.time ?? DEFAULT_TIME;
    const parts = toRepeatParts(command);
    const rule = withRuleAt(parts, startsOn, weekStart);
    if (parts && !rule) return withNotKept(RULE_PROBLEM_WORDS.shape);
    const built = buildScheduleRule(rule, startsOn, today);
    if ('error' in built) return withNotKept(RULE_PROBLEM_WORDS[built.error]);
    const id = input.newId();
    const schedule = {
      repeat: built.repeat,
      startsOn,
      time,
      timeZone: null,
      skipped: [] as string[],
      moved: {},
      pausedFrom: null,
      pausedUntil: null,
    };
    const { words, next } = describeScheduledRule(
      schedule,
      input.homeZone,
      input.now,
    );
    const [first] = next;
    if (!first) return withNotKept(RULE_PROBLEM_WORDS.neverComes);
    const doc = {
      status: 'active',
      endedBy: null,
      ...schedule,
      nextRunAt: first.at,
      nextRunKey: first.key,
      splitFromId: null,
      kind: command.held.length > 0 ? 'commands' : 'prompt',
      allowed: command.allowedKinds,
      needsApproval: false,
      lastRunAt: null,
      lastRunCaptureId: null,
      lastRunDueAt: null,
      lastOutcome: null,
      lastFailReason: null,
      runNowAt: null,
      createdBy: 'nomos',
      sourceCaptureId: input.captureId,
      createdAt: input.now,
      lastEditedAt: null,
      sealed: input.seal({
        title: command.title,
        instruction: command.instruction,
        heldCommands: heldWords(command),
      }),
    };
    stored.set(id, {
      id,
      doc,
      words: {
        title: command.title,
        instruction: command.instruction,
        heldCommands: null,
      },
    });
    return {
      ...acc,
      creates: [...acc.creates, { id, doc }],
      effectRefs: [
        ...acc.effectRefs,
        { op: 'create', collection: 'scheduledActions', docId: id },
      ],
      effects: [
        ...acc.effects,
        { written: { 'sealed.title': command.title }, previous: null },
      ],
      lines: [
        ...acc.lines,
        `${command.title}: ${words}. Next: ${next.map((run) => toDayWords(run.day)).join(', ')}`,
      ],
    };
  };

  const planChange = (
    acc: ScheduledPlan,
    command: ChangeScheduledActionCommand,
  ): ScheduledPlan => {
    const found = stored.get(command.actionId);
    const withNotKept = (line: string) => ({
      ...acc,
      notKept: [...acc.notKept, line],
    });
    if (!found) return withNotKept('That scheduled action is gone');
    const title = found.words?.title ?? 'That scheduled action';
    const state = readActionState(found.doc);
    const zone = state.timeZone ?? input.homeZone;
    const change = toChange(command, state, zone);
    if ('refusal' in change) return withNotKept(`${title}: ${change.refusal}`);
    const result = planScheduleChange(state, change.change, {
      homeZone: input.homeZone,
      now: input.now,
    });
    if ('refused' in result) {
      return withNotKept(`${title}: ${CHANGE_REFUSAL_WORDS[result.refused]}`);
    }
    const fields: Record<string, unknown> = {
      ...result.fields,
      lastEditedAt: input.now,
    };
    const previous = Object.fromEntries(
      Object.keys(fields).map((field) => [field, found.doc[field] ?? null]),
    );
    stored.set(found.id, { ...found, doc: { ...found.doc, ...fields } });
    const label = { 'sealed.title': title };
    const splitId = result.created ? input.newId() : null;
    const created =
      result.created && splitId
        ? {
            ...found.doc,
            ...result.created,
            splitFromId: found.id,
            lastRunAt: null,
            lastRunCaptureId: null,
            lastRunDueAt: null,
            lastOutcome: null,
            lastFailReason: null,
            sourceCaptureId: input.captureId,
            createdAt: input.now,
            lastEditedAt: null,
          }
        : null;
    const verb = linesOf(command, result.key, title, result.dropped);
    return {
      ...acc,
      creates:
        created && splitId
          ? [...acc.creates, { id: splitId, doc: created }]
          : acc.creates,
      updates: [...acc.updates, { id: found.id, data: fields }],
      effectRefs: [
        ...acc.effectRefs,
        { op: 'update', collection: 'scheduledActions', docId: found.id },
        ...(splitId
          ? [
              {
                op: 'create',
                collection: 'scheduledActions',
                docId: splitId,
              } as EffectRef,
            ]
          : []),
      ],
      effects: [
        ...acc.effects,
        {
          written: { ...fields, ...label },
          previous: { ...previous, ...label },
        },
        ...(splitId ? [{ written: label, previous: null } as Effect] : []),
      ],
      lines: [...acc.lines, verb],
    };
  };

  const linesOf = (
    command: ChangeScheduledActionCommand,
    key: string | null,
    title: string,
    dropped: number,
  ) => {
    const day = key ? toDayWords(key) : null;
    const base =
      command.change === 'skip'
        ? `Skipped ${title}${day ? ` on ${day}` : ''}`
        : command.change === 'pause'
          ? `Paused ${title}`
          : command.change === 'resume'
            ? `Resumed ${title}`
            : command.change === 'end'
              ? `Ended ${title}`
              : command.change === 'move' || command.scope === 'thisOne'
                ? `Moved ${title}${day ? ` from ${day}` : ''}${command.toDay ? ` to ${toDayWords(command.toDay)}` : ''}`
                : `Changed ${title} from ${day ?? 'its next run'} on`;
    return dropped > 0
      ? `${base}, and let ${dropped} skipped or moved ${dropped === 1 ? 'run' : 'runs'} go that no longer fit`
      : base;
  };

  const toChange = (
    command: ChangeScheduledActionCommand,
    state: ActionState,
    zone: string,
  ): { change: ScheduleChange } | { refusal: string } => {
    if (command.change === 'pause') return { change: { kind: 'pause' } };
    if (command.change === 'resume') return { change: { kind: 'resume' } };
    if (command.change === 'end') return { change: { kind: 'end' } };
    if (command.change === 'skip') {
      return { change: { kind: 'skip', key: command.fromKey } };
    }
    if (command.change === 'move' || command.scope === 'thisOne') {
      return command.toDay
        ? {
            change: {
              kind: 'move',
              key: command.fromKey,
              day: command.toDay,
              time: command.time,
            },
          }
        : { refusal: 'Which day should it move to?' };
    }
    const from =
      command.fromKey ?? state.nextRunKey ?? toDayKeyIn(input.now, zone);
    const rule = command.repeat
      ? repeatFromParts(
          {
            freq:
              command.repeat.freq === 'subDaily' ? null : command.repeat.freq,
            interval: command.repeat.interval,
            weekdays: command.repeat.weekdays,
            monthBy: command.repeat.monthBy,
            nth: command.repeat.nth,
            endsKind: command.repeat.endsKind,
            until: command.repeat.until,
            count: command.repeat.count,
          },
          from,
          weekStart,
        )
      : null;
    if (command.repeat && !rule) return { refusal: RULE_PROBLEM_WORDS.shape };
    const check = rule ? buildScheduleRule(rule, from, today) : null;
    if (check && 'error' in check) {
      return { refusal: RULE_PROBLEM_WORDS[check.error] };
    }
    return {
      change: {
        kind: 'following',
        fromKey: command.fromKey,
        rule,
        time: command.time,
      },
    };
  };

  return input.commands.reduce(step, EMPTY);
}

export interface ScheduledResolveInput {
  captureId: string;
  questionId: string;
  optionId: string;
  by: 'tap' | 'voice';
  now: number;
  executionId: string;
  stored: Map<string, StoredScheduled>;
  homeZone: string;
  capture: {
    status: string;
    executionIds: string[];
    questionState: Record<string, QuestionStateEntry>;
  };
  opened: Record<string, unknown>;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Decides what answering "Make 2 daily actions?" writes, without touching a database: a yes makes each held daily action against what the person has now (the cap still counts), a no makes none, and the question is closed either way. */
export function planResolveScheduled(input: ScheduledResolveInput):
  | { refused: 'answered' | 'unknown' | 'gone' }
  | {
      refused: null;
      plan: ScheduledPlan | null;
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
  if (!held || (optionId !== 'yes' && optionId !== 'no')) {
    return { refused: 'unknown' };
  }
  const commands = Array.isArray(held.commands)
    ? held.commands.filter(
        (entry): entry is ScheduleActionCommand =>
          isRecord(entry) &&
          entry.kind === 'scheduleAction' &&
          isRecord(entry.repeat),
      )
    : [];
  const plan =
    optionId === 'yes' && commands.length > 0
      ? planScheduledActions({
          commands,
          stored: input.stored,
          homeZone: input.homeZone,
          now,
          captureId: input.captureId,
          isAnswer: true,
          newId: input.newId,
          seal: input.seal,
          room: 20,
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
    plan,
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
              shape: 'yesNo',
              optionId,
              otherText: null,
            },
          },
        },
      },
      status:
        !isOpen && capture.status === 'needsYou' ? 'sorted' : capture.status,
      executionIds:
        plan && plan.effects.length > 0
          ? [...capture.executionIds, input.executionId]
          : capture.executionIds,
    },
  };
}
