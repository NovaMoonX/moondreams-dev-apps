import { createHash } from 'node:crypto';

import { wrapDataKey } from '../../functions/src/appKeys/wrap.ts';
import { buildSpokenAck } from '../../functions/src/apps/helm/nomos/spoken.ts';
import {
  deriveSeedDataKey,
  keyCheckPath,
  makeKeyCheck,
  sealForHelm,
  wrappedKeyPath,
} from '../../functions/src/apps/helm/helmKey.ts';
import {
  DEFAULT_DAY_END_TIME,
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_DAY_START_TIME,
  DEFAULT_PLAN_FILL_PERCENT,
} from '../../src/apps/helm/constants.ts';
import { planUndo } from '../../src/apps/helm/nomos/planUndo.ts';
import { openJson, sealJson } from '../../src/apps/helm/security.ts';
import {
  getDueDay,
  readCapture,
} from '../../src/apps/helm/utils/captureReading.ts';
import type {
  Capture,
  CaptureSealed,
  Execution,
  ExecutionSealed,
  ScreenContext,
  HelmEncryption,
  Task,
  TaskDue,
  TaskSealed,
} from '../../src/apps/helm/types.ts';
import {
  GOOGLE_ACCOUNT_PREFIX,
  SITE_ACCOUNT_ID,
  toAppConnectorId,
  toGrantId,
  type ConnectionAccount,
  type ConnectionGrant,
} from '../../src/lib/connections/contract.ts';
import { A_LIST_SHARES } from '../../functions/src/apps/a-list/share/manifest.ts';
import { GOING_ONCE_SHARES } from '../../functions/src/apps/going-once/share/manifest.ts';
import { PINCH_SHARES } from '../../functions/src/apps/pinch/share/manifest.ts';
import { getShowtime } from './aList.ts';
import { getSeedPickupOn } from './goingOnce.ts';
import { readEmulatorKeyring } from './runway.ts';
import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

interface CopyDefinition {
  category: string;
  sourceRef: string;
  kind: 'event' | 'task' | 'place' | 'project';
  title: string;
  subtitle: string | null;
  startAt: number | null;
  dueAt: number | null;
  deepLink: string;
  endAt?: number;
  isAllDay?: boolean;
  placeLabel?: string;
  extra?: Record<string, string | number>;
}

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

// Alex keeps Pacific Time, so the first open shows a profile that was made earlier; Jamie's zone differs from the emulator's.
const SEED_PROFILES = [
  { user: FIXTURE_USERS.partnerOne, timeZone: 'America/Los_Angeles' },
  { user: FIXTURE_USERS.partnerTwo, timeZone: 'America/New_York' },
];

const SORT_DELAY_MS = 4_000;

// Alex's one fixture Google account: its calendars are the two a fixture read offers, the second marked as shifts.
const GOOGLE_ACCOUNT_ID = `${GOOGLE_ACCOUNT_PREFIX}${createHash('sha256').update('fixture-personal').digest('hex').slice(0, 16)}`;
const GOOGLE_PRIMARY_CALENDAR = 'personal@example.com';
const GOOGLE_SHIFTS_CALENDAR = 'shifts-personal@group.calendar.google.com';
const CALENDAR_READ_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

type HandTask = {
  title: string;
  notes?: string;
  steps?: string[];
  stepsDone?: number;
} & Partial<
  Pick<
    Task,
    | 'importance'
    | 'isUrgent'
    | 'durationMinutes'
    | 'energy'
    | 'context'
    | 'waitsOnTaskIds'
    | 'waitsOnWhoId'
  >
> & { notUntilDays?: number; dueDays?: number };

/** Tasks the person made by hand, each showing one state of the task sheet: not yet, awake with every field, waiting on a task, waiting on someone, and steps. */
const SEED_HAND_TASKS: HandTask[] = [
  { title: 'Order the welcome bags', notUntilDays: 21, importance: 'could' },
  {
    title: 'Confirm the cake order',
    notUntilDays: -1,
    dueDays: 2,
    importance: 'must',
    isUrgent: true,
    durationMinutes: 15,
    energy: 'low',
    context: 'onPhone',
    notes: 'Sweet Layer Bakery, ask for the lemon tier',
  },
  {
    title: 'Send the florist the final count',
    waitsOnTaskIds: ['seed-task-4-2'],
    dueDays: 10,
  },
  {
    title: 'Book the florist delivery',
    waitsOnWhoId: 'seed-who-dana',
    dueDays: 25,
  },
  {
    title: 'Pack for the venue walk-through',
    steps: [
      'Print the floor plan',
      'Charge the camera',
      'Bring the swatches',
      'Pack the measuring tape',
    ],
    stepsDone: 2,
    energy: 'medium',
    context: 'atHome',
  },
];

/** What the assistant made of each sorted turn, by the turn's place in `SEED_TURNS`: a task's title and the words of the turn its day was read from. The first turn is left as saved, so home shows both kinds of line. */
const SEED_TASKS: Record<number, { title: string; dueWords: string | null }[]> =
  {
    1: [{ title: 'Lunch with Sam', dueWords: 'Thursday' }],
    2: [{ title: 'Call Grandpa about the wedding questions', dueWords: null }],
    3: [
      { title: 'Buy the rings', dueWords: null },
      { title: 'Call Dana', dueWords: 'Friday' },
    ],
    4: [
      { title: 'Book the hair trial', dueWords: null },
      { title: 'Send the save-the-dates', dueWords: 'Saturday' },
    ],
  };

/** The turns that were spoken; their line is the one the server would seal for them. */
const SEED_VOICE_TURNS = new Set([1, 2]);

/** The turn whose two tasks were taken back: the first is deleted, the second kept because its day was moved to Sunday afterwards. */
const UNDONE_TURN = 4;
const UNDO_DELAY_MS = 3 * MINUTE_MS;

const summarize = (count: number) =>
  count === 1 ? 'Made a task' : `Made ${count} tasks`;

/** Two sessions: one yesterday, one a few minutes ago (so it is still the session in progress). `seenAt` is null on the turns the Inbox lists as new. */
const SEED_TURNS = [
  {
    session: 'yesterday',
    minutesAgo: 26 * 60,
    text: 'Dana says centerpieces are $2,100 now',
    isSeen: true,
  },
  {
    session: 'yesterday',
    minutesAgo: 26 * 60 - 3,
    text: 'Lunch with Sam Thursday',
    isSeen: false,
  },
  {
    session: 'today',
    minutesAgo: 6,
    text: 'Call Grandpa when I get home about the wedding questions',
    isSeen: false,
  },
  {
    session: 'today',
    minutesAgo: 3,
    text: "Mom's birthday is June 3, buy the rings, call Dana Friday",
    isSeen: false,
  },
  {
    session: 'yesterday',
    minutesAgo: 26 * 60 - 6,
    text: 'Book the hair trial and send the save-the-dates Saturday',
    isSeen: true,
  },
  {
    session: 'today',
    minutesAgo: 2,
    text: 'Move this to Saturday',
    isSeen: false,
  },
] as const;

/** The turn asked from Today with Call Dana open: it moves that task's day to Saturday, so a page's "this" has a seeded example. */
const MOVE_TURN = 5;
const MOVED_TASK = { id: 'seed-task-4-2', turn: 3 };
const MOVE_SCREEN: ScreenContext = {
  view: 'today',
  focus: { collection: 'tasks', id: MOVED_TASK.id },
  visible: [
    { collection: 'tasks', id: MOVED_TASK.id },
    { collection: 'tasks', id: 'seed-task-hand-2' },
    { collection: 'tasks', id: 'seed-task-3-1' },
  ],
  v: 1,
};

type SeedHold = 'failed' | 'dailyLimit' | 'couldNotRead' | null;

/** A turn the assistant could not sort, one of each way: three failed readings, held by the day's limit, and words it could make nothing of. */
const SEED_HELD_TURNS = [
  {
    session: 'yesterday',
    minutesAgo: 26 * 60 - 12,
    text: 'Ask Priya about the offsite budget',
    isSeen: false,
    held: 'failed',
  },
  {
    session: 'yesterday',
    minutesAgo: 26 * 60 - 20,
    text: 'the thing with the',
    isSeen: false,
    held: 'couldNotRead',
  },
  {
    session: 'today',
    minutesAgo: 1,
    text: 'Order more printer paper',
    isSeen: true,
    held: 'dailyLimit',
  },
] as const;

const ALL_TURNS = [
  ...SEED_TURNS.map((turn) => ({ ...turn, held: null as SeedHold })),
  ...SEED_HELD_TURNS.map((turn) => ({ ...turn, held: turn.held as SeedHold })),
];

const toHeldFields = (
  hold: SeedHold,
  turnTime: number,
  isSorted: boolean,
): Pick<
  Capture,
  'status' | 'heldReason' | 'attempts' | 'lastErrorCode' | 'questionState'
> => {
  if (hold === 'failed') {
    return {
      status: 'failed',
      heldReason: null,
      attempts: 3,
      lastErrorCode: 'modelError',
      questionState: {},
    };
  }
  if (hold === 'dailyLimit') {
    return {
      status: 'received',
      heldReason: 'dailyLimit',
      attempts: 0,
      lastErrorCode: null,
      questionState: {},
    };
  }
  if (hold === 'couldNotRead') {
    return {
      status: 'needsYou',
      heldReason: null,
      attempts: 1,
      lastErrorCode: null,
      questionState: {
        'seed-question-1': {
          kind: 'couldNotRead',
          shape: 'freeText',
          askedAt: turnTime + SORT_DELAY_MS,
          answeredAt: null,
          skippedAt: null,
        },
      },
    };
  }
  return {
    status: isSorted ? 'sorted' : 'received',
    heldReason: null,
    attempts: 0,
    lastErrorCode: null,
    questionState: {},
  };
};

const dueFrom = (
  dates: { text: string; due: TaskDue }[],
  words: string | null,
) =>
  words === null
    ? null
    : (dates.find((span) =>
        span.text.toLowerCase().includes(words.toLowerCase()),
      )?.due ?? null);

/** The second task's day moves to Sunday before the undo, so that task is kept. */
async function buildUndone(input: {
  executionId: string;
  execution: Execution;
  effects: { written: Record<string, unknown>; previous: null }[];
  tasks: { id: string; task: Task }[];
  sortedAt: number;
  encryption: HelmEncryption;
}) {
  const { executionId, execution, effects, sortedAt, encryption } = input;
  const keptId = input.tasks[1].id;
  const tasks = input.tasks.map((entry) =>
    entry.id === keptId
      ? {
          id: entry.id,
          task: {
            ...entry.task,
            due:
              entry.task.due?.kind === 'day'
                ? { kind: 'day' as const, date: entry.task.due.date + DAY_MS }
                : entry.task.due,
            lastEditedAt: sortedAt + MINUTE_MS,
          },
        }
      : entry,
  );
  const now = sortedAt + UNDO_DELAY_MS;
  const undoId = `seed-execution-undo-${UNDONE_TURN + 1}`;
  const titles = await Promise.all(
    tasks.map(async ({ id, task }) => ({
      id,
      opened: await openJson<TaskSealed>(task.sealed, encryption),
    })),
  );
  const result = planUndo({
    original: {
      ...execution,
      id: executionId,
      summary: summarize(effects.length),
      effects,
      undoReport: null,
      spoken: null,
      goneIds: null,
      isUnreadable: false,
    },
    targets: new Map(
      tasks.map(({ id, task }) => [
        id,
        {
          docId: id,
          data: task as unknown as Record<string, unknown>,
          opened: titles.find((entry) => entry.id === id)?.opened ?? null,
        },
      ]),
    ),
    undoExecutionId: undoId,
    now,
  });
  if (result.kind !== 'write')
    throw new Error('The seeded undo has no writes.');
  return {
    tasks: tasks.filter(({ id }) => !result.deletes.includes(id)),
    original: { ...execution, undoneByExecutionId: undoId },
    undo: {
      id: undoId,
      execution: {
        ...result.undoExecution,
        sealed: await sealJson<ExecutionSealed>(result.undoSealed, encryption),
      } satisfies Execution,
    },
  };
}

/** A task edit that moves its day: the execution that records it. The task takes the new day and the time of the edit. */
async function buildMove(input: {
  movedTitle: string;
  fromDue: TaskDue | null;
  toDue: TaskDue | null;
  captureId: string;
  sortedAt: number;
  encryption: HelmEncryption;
}): Promise<{
  execution: Execution;
  due: TaskDue | null;
  editedAt: number;
}> {
  const { movedTitle, fromDue, toDue, sortedAt } = input;
  const execution: Execution = {
    captureId: input.captureId,
    actor: 'nomos',
    category: 'organize',
    autonomyLevel: 2,
    state: 'succeeded',
    effectRefs: [{ op: 'update', collection: 'tasks', docId: MOVED_TASK.id }],
    undoesExecutionId: null,
    undoneByExecutionId: null,
    questionRef: null,
    errorCode: null,
    createdAt: sortedAt,
    decidedAt: sortedAt,
    finishedAt: sortedAt,
    sealed: await sealJson<ExecutionSealed>(
      {
        summary: 'Updated a task',
        commands: [
          {
            kind: 'updateTask',
            taskId: MOVED_TASK.id,
            title: null,
            due: toDue,
            hasDue: true,
            isUrgent: null,
          },
        ],
        effects: [
          {
            written: { 'sealed.title': movedTitle, due: toDue },
            previous: { 'sealed.title': movedTitle, due: fromDue },
          },
        ],
        undoReport: null,
        spoken: null,
        goneIds: null,
      },
      input.encryption,
    ),
  };
  return { execution, due: toDue, editedAt: sortedAt };
}

/** Three messages sent before the reply started, in today's session: the first leads, the other two joined it, and one reply covers them all. */
const BACK_TO_BACK = {
  messages: [
    { text: 'Add milk', secondsAgo: 30 },
    { text: 'and eggs', secondsAgo: 20 },
    { text: 'oh and call Dana', secondsAgo: 10 },
  ],
  tasks: ['Buy milk', 'Buy eggs', 'Call Dana'],
  summary: 'Got all three: made 3 tasks',
};

async function buildBackToBack(input: {
  uid: string;
  turnIndexFrom: number;
  now: number;
  timeZone: string;
  encryption: HelmEncryption;
}) {
  const { uid, turnIndexFrom, now, timeZone, encryption } = input;
  const captureIds = BACK_TO_BACK.messages.map(
    (_, order) => `seed-turn-b2b-${order + 1}`,
  );
  const [leadId, ...joinedIds] = captureIds;
  const executionId = 'seed-execution-b2b';
  const lastAt = now - BACK_TO_BACK.messages.at(-1)!.secondsAgo * 1000;
  const sortedAt = lastAt + SORT_DELAY_MS;
  const captures = await Promise.all(
    BACK_TO_BACK.messages.map(async (message, order) => {
      const createdAt = now - message.secondsAgo * 1000;
      const capture: Capture = {
        inputMode: 'typed',
        sttProvider: null,
        interruptedCaptureId: null,
        ttsProvider: null,
        medium: 'web',
        sessionId: `seed-${uid}-today`,
        turnIndex: turnIndexFrom + order,
        route: order === 0 ? 'quick' : null,
        status: 'sorted',
        heldReason: null,
        claimId: null,
        claimedAt: null,
        attempts: 0,
        lastErrorCode: null,
        questionState: {},
        executionIds: order === 0 ? [executionId] : [],
        turnLeadId: order === 0 ? null : leadId,
        joinedCaptureIds: order === 0 ? joinedIds : [],
        seenAt: createdAt,
        createdAt,
        sortedAt,
        screen: null,
        sealed: await sealJson<CaptureSealed>(
          {
            text: message.text,
            reading: readCapture(message.text, {
              now: createdAt,
              timeZone,
              assistantName: DEFAULT_ASSISTANT_NAME,
            }),
          },
          encryption,
        ),
      };
      return { id: captureIds[order], capture };
    }),
  );
  const tasks = await Promise.all(
    BACK_TO_BACK.tasks.map(async (title, order) => {
      const task: Task = {
        status: 'open',
        importance: null,
        isUrgent: false,
        due: null,
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
        sourceCaptureId: leadId,
        executionId,
        createdAt: sortedAt,
        lastEditedAt: null,
        completedAt: null,
        sealed: await sealJson<TaskSealed>(
          { title, notes: null, steps: {} },
          encryption,
        ),
      };
      return { id: `seed-task-b2b-${order + 1}`, task };
    }),
  );
  const execution: Execution = {
    captureId: leadId,
    actor: 'nomos',
    category: 'organize',
    autonomyLevel: 2,
    state: 'succeeded',
    effectRefs: tasks.map(({ id }) => ({
      op: 'create',
      collection: 'tasks',
      docId: id,
    })),
    undoesExecutionId: null,
    undoneByExecutionId: null,
    questionRef: null,
    errorCode: null,
    createdAt: sortedAt,
    decidedAt: sortedAt,
    finishedAt: sortedAt,
    sealed: await sealJson<ExecutionSealed>(
      {
        summary: BACK_TO_BACK.summary,
        commands: BACK_TO_BACK.tasks.map((title) => ({
          kind: 'createTask',
          title,
          due: null,
        })),
        effects: BACK_TO_BACK.tasks.map((title) => ({
          written: {
            'sealed.title': title,
            due: null,
            status: 'open',
            isUrgent: false,
          },
          previous: null,
        })),
        undoReport: null,
        spoken: null,
        goneIds: null,
      },
      encryption,
    ),
  };
  return { captures, tasks, execution, executionId };
}

export async function seedHelm(context: SeedContext): Promise<SeedResult> {
  const createdAt = context.now - 14 * DAY_MS;
  const keyring = readEmulatorKeyring('HELM_MASTER_KEYS');
  const users = context.firestore
    .collection('apps')
    .doc('helm')
    .collection('users');
  const batch = context.firestore.batch();

  const turnCounts = await Promise.all(
    SEED_PROFILES.map(async ({ user, timeZone }) => {
      batch.set(users.doc(user.uid), {
        timeZone,
        dayStartTime: DEFAULT_DAY_START_TIME,
        dayEndTime: DEFAULT_DAY_END_TIME,
        planFillPercent: DEFAULT_PLAN_FILL_PERCENT,
        shiftCalendarIds:
          user.uid === FIXTURE_USERS.partnerOne.uid
            ? [`${GOOGLE_ACCOUNT_ID}/${GOOGLE_SHIFTS_CALENDAR}`]
            : [],
        busyAllDayEventRefs: [],
        calendarOfferFoldedAt: null,
        hasSeenAiNotice: false,
        voiceMode: 'cloudWhenOnline',
        isWakeWordOn: false,
        isHandsFreeOn: true,
        hasSeenVoiceNotice: false,
        createdAt,
        lastEditedAt: null,
      });

      const data = deriveSeedDataKey(keyring, user.uid);
      batch.set(
        context.firestore.doc(wrappedKeyPath(user.uid)),
        wrapDataKey(keyring, user.uid, data, createdAt),
      );
      const encryption: HelmEncryption = {
        appId: 'helm',
        keyId: data.keyId,
        keyVersion: 1,
        key: data.key.toString('hex'),
      };

      const builtTurns = await Promise.all(
        ALL_TURNS.map(async (turn, index) => {
          const turnTime = context.now - turn.minutesAgo * MINUTE_MS;
          const reading = readCapture(turn.text, {
            now: turnTime,
            timeZone,
            assistantName: DEFAULT_ASSISTANT_NAME,
          });
          const sortedTasks = (SEED_TASKS[index] ?? []).map((entry, order) => ({
            id: `seed-task-${index + 1}-${order + 1}`,
            title: entry.title,
            due: dueFrom(reading.dates, entry.dueWords),
          }));
          const executionId = `seed-execution-${index + 1}`;
          const isMove = index === MOVE_TURN;
          const isSorted = sortedTasks.length > 0 || isMove;
          const sortedAt = turnTime + SORT_DELAY_MS;
          const heldFields = toHeldFields(turn.held, turnTime, isSorted);
          const spoken =
            isSorted && SEED_VOICE_TURNS.has(index)
              ? (buildSpokenAck({
                  inputMode: 'voice',
                  counts: {
                    made: sortedTasks.length,
                    updated: 0,
                    completed: 0,
                  },
                  messageCount: 1,
                  created: sortedTasks,
                  timeZone,
                  now: sortedAt,
                }) ?? undefined)
              : undefined;
          const capture: Capture = {
            inputMode: spoken === undefined ? 'typed' : 'voice',
            sttProvider: spoken === undefined ? null : 'browser',
            interruptedCaptureId: null,
            ttsProvider: spoken === undefined ? null : 'natural',
            medium: 'web',
            sessionId: `seed-${user.uid}-${turn.session}`,
            turnIndex: ALL_TURNS.filter(
              (entry) => entry.session === turn.session,
            ).indexOf(turn),
            route: !isSorted
              ? null
              : sortedTasks.length > 2 || turn.text.length > 55
                ? 'full'
                : 'quick',
            claimId: null,
            claimedAt: null,
            ...heldFields,
            executionIds: isSorted ? [executionId] : [],
            turnLeadId: null,
            joinedCaptureIds: [],
            seenAt: turn.isSeen ? turnTime + MINUTE_MS : null,
            createdAt: turnTime,
            sortedAt: isSorted ? sortedAt : null,
            screen: isMove ? MOVE_SCREEN : null,
            sealed: await sealJson<CaptureSealed>(
              { text: turn.text, reading },
              encryption,
            ),
          };
          const tasks = await Promise.all(
            sortedTasks.map(async ({ id, title, due }) => {
              const task: Task = {
                status: 'open',
                importance: null,
                isUrgent: false,
                due,
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
                sourceCaptureId: `seed-turn-${index + 1}`,
                executionId,
                createdAt: sortedAt,
                lastEditedAt: null,
                completedAt: null,
                sealed: await sealJson<TaskSealed>(
                  { title, notes: null, steps: {} },
                  encryption,
                ),
              };
              return { id, task };
            }),
          );
          const effects = sortedTasks.map(({ title, due }) => ({
            written: {
              'sealed.title': title,
              due,
              status: 'open',
              isUrgent: false,
            },
            previous: null,
          }));
          const originalExecution: Execution | null = isSorted
            ? {
                captureId: `seed-turn-${index + 1}`,
                actor: 'nomos',
                category: 'organize',
                autonomyLevel: 2,
                state: 'succeeded',
                effectRefs: sortedTasks.map(({ id }) => ({
                  op: 'create',
                  collection: 'tasks',
                  docId: id,
                })),
                undoesExecutionId: null,
                undoneByExecutionId: null,
                questionRef: null,
                errorCode: null,
                createdAt: sortedAt,
                decidedAt: sortedAt,
                finishedAt: sortedAt,
                sealed: await sealJson<ExecutionSealed>(
                  {
                    summary: summarize(sortedTasks.length),
                    commands: sortedTasks.map(({ title, due }) => ({
                      kind: 'createTask',
                      title,
                      due,
                    })),
                    effects,
                    undoReport: null,
                    spoken: spoken ?? null,
                    goneIds: null,
                  },
                  encryption,
                ),
              }
            : null;
          const undone =
            index === UNDONE_TURN && originalExecution
              ? await buildUndone({
                  executionId,
                  execution: originalExecution,
                  effects,
                  tasks,
                  sortedAt,
                  encryption,
                })
              : null;
          const moved = isMove
            ? await buildMove({
                movedTitle: SEED_TASKS[MOVED_TASK.turn][1].title,
                fromDue: dueFrom(
                  readCapture(ALL_TURNS[MOVED_TASK.turn].text, {
                    now:
                      context.now -
                      ALL_TURNS[MOVED_TASK.turn].minutesAgo * MINUTE_MS,
                    timeZone,
                    assistantName: DEFAULT_ASSISTANT_NAME,
                  }).dates,
                  SEED_TASKS[MOVED_TASK.turn][1].dueWords,
                ),
                toDue: dueFrom(reading.dates, 'Saturday'),
                captureId: `seed-turn-${index + 1}`,
                sortedAt,
                encryption,
              })
            : null;
          const execution =
            moved?.execution ?? undone?.original ?? originalExecution;
          return {
            moved,
            id: `seed-turn-${index + 1}`,
            capture,
            tasks: undone?.tasks ?? tasks,
            execution,
            executionId,
            undo: undone?.undo ?? null,
          };
        }),
      );
      const moved = builtTurns.find((turn) => turn.moved)?.moved ?? null;
      const turns = builtTurns.map((turn) => ({
        ...turn,
        tasks: turn.tasks.map((entry) =>
          moved && entry.id === MOVED_TASK.id
            ? {
                ...entry,
                task: {
                  ...entry.task,
                  due: moved.due,
                  lastEditedAt: moved.editedAt,
                },
              }
            : entry,
        ),
      }));
      const person = users.doc(user.uid);
      const today = getDueDay({ kind: 'moment', at: context.now }, timeZone);
      const handTasks = await Promise.all(
        SEED_HAND_TASKS.map(async (entry, index) => {
          const made = context.now - (index + 1) * 90 * MINUTE_MS;
          const stepIds = (entry.steps ?? []).map(
            (_, order) => `seed-step-${index + 1}-${order + 1}`,
          );
          const task: Task = {
            status: 'open',
            importance: entry.importance ?? null,
            isUrgent: entry.isUrgent ?? false,
            due:
              entry.dueDays !== undefined
                ? { kind: 'day', date: today + entry.dueDays * DAY_MS }
                : null,
            durationMinutes: entry.durationMinutes ?? null,
            energy: entry.energy ?? null,
            context: entry.context ?? null,
            projectId: null,
            milestoneId: null,
            whoIds: [],
            placeIds: [],
            notUntil:
              entry.notUntilDays !== undefined
                ? today + entry.notUntilDays * DAY_MS
                : null,
            waitsOnTaskIds: entry.waitsOnTaskIds ?? [],
            waitsOnWhoId: entry.waitsOnWhoId ?? null,
            stepState: Object.fromEntries(
              stepIds.map((id, order) => [
                id,
                {
                  order,
                  doneAt:
                    order < (entry.stepsDone ?? 0) ? made + MINUTE_MS : null,
                },
              ]),
            ),
            mediaIds: [],
            createdBy: 'person',
            sourceCaptureId: null,
            executionId: null,
            createdAt: made,
            lastEditedAt: made + 3 * MINUTE_MS,
            completedAt: null,
            sealed: await sealJson<TaskSealed>(
              {
                title: entry.title,
                notes: entry.notes ?? null,
                steps: Object.fromEntries(
                  stepIds.map((id, order) => [
                    id,
                    { text: (entry.steps ?? [])[order] },
                  ]),
                ),
              },
              encryption,
            ),
          };
          return { id: `seed-task-hand-${index + 1}`, task };
        }),
      );
      handTasks.forEach((entry) =>
        batch.set(person.collection('tasks').doc(entry.id), entry.task),
      );
      turns.forEach(({ id, capture, tasks, execution, executionId, undo }) => {
        batch.set(person.collection('captures').doc(id), capture);
        tasks.forEach((entry) =>
          batch.set(person.collection('tasks').doc(entry.id), entry.task),
        );
        if (execution) {
          batch.set(
            person.collection('executions').doc(executionId),
            execution,
          );
        }
        if (undo) {
          batch.set(
            person.collection('executions').doc(undo.id),
            undo.execution,
          );
        }
      });
      const backToBack = await buildBackToBack({
        uid: user.uid,
        turnIndexFrom: ALL_TURNS.filter((entry) => entry.session === 'today')
          .length,
        now: context.now,
        timeZone,
        encryption,
      });
      backToBack.captures.forEach(({ id, capture }) =>
        batch.set(person.collection('captures').doc(id), capture),
      );
      backToBack.tasks.forEach((entry) =>
        batch.set(person.collection('tasks').doc(entry.id), entry.task),
      );
      batch.set(
        person.collection('executions').doc(backToBack.executionId),
        backToBack.execution,
      );
      const backToBackCount =
        backToBack.captures.length + backToBack.tasks.length + 1;
      return (
        backToBackCount +
        turns.reduce(
          (total, turn) =>
            total +
            1 +
            turn.tasks.length +
            (turn.execution ? 1 : 0) +
            (turn.undo ? 1 : 0),
          handTasks.length,
        )
      );
    }),
  );

  const connectedAt = context.now - 3 * DAY_MS;
  const syncedAt = context.now - 2 * 60 * MINUTE_MS;
  const pinchConnectorId = toAppConnectorId('pinch');
  const pinchGrantId = toGrantId('helm', pinchConnectorId, SITE_ACCOUNT_ID);
  // Date-only meals land on the person's own day, which can differ from the UTC day.
  const today = Date.parse(
    `${new Date(context.now).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })}T00:00:00Z`,
  );

  const copyDefinitions: CopyDefinition[] = [
    {
      category: 'plannedMeals',
      sourceRef: 'plannedMeals/seed-meal-1',
      kind: 'event' as const,
      title: 'Lemon pasta',
      subtitle: 'Dinner',
      startAt: today + DAY_MS,
      dueAt: null,
      deepLink: '/pinch?tab=calendar',
    },
    {
      category: 'plannedMeals',
      sourceRef: 'plannedMeals/seed-meal-2',
      kind: 'event' as const,
      title: 'Taco night',
      subtitle: 'Dinner',
      startAt: today + 2 * DAY_MS,
      dueAt: null,
      deepLink: '/pinch?tab=calendar',
    },
    {
      category: 'plannedMeals',
      sourceRef: 'plannedMeals/seed-meal-3',
      kind: 'event' as const,
      title: 'Oatmeal with berries',
      subtitle: 'Breakfast',
      startAt: today,
      dueAt: null,
      deepLink: '/pinch?tab=calendar',
    },
    {
      category: 'shoppingList',
      sourceRef: 'shoppingItems/seed-line-1',
      kind: 'task' as const,
      title: 'Lemons',
      subtitle: '4',
      startAt: null,
      dueAt: null,
      deepLink: '/pinch?tab=shopping',
    },
    {
      category: 'shoppingList',
      sourceRef: 'shoppingItems/seed-line-2',
      kind: 'task' as const,
      title: 'Spaghetti',
      subtitle: '500 g',
      startAt: null,
      dueAt: null,
      deepLink: '/pinch?tab=shopping',
    },
    {
      category: 'shoppingList',
      sourceRef: 'shoppingItems/seed-line-3',
      kind: 'task' as const,
      title: 'Tortillas',
      subtitle: null,
      startAt: null,
      dueAt: null,
      deepLink: '/pinch?tab=shopping',
    },
  ];

  const writeCopies = (
    uid: string,
    copies: CopyDefinition[],
    endedAt: number | null,
    source = { connectorId: pinchConnectorId, grantId: pinchGrantId },
  ) => {
    const data = deriveSeedDataKey(keyring, uid);
    copies.forEach((copy) => {
      const id = createHash('sha256')
        .update(`${source.grantId}|${copy.category}|${copy.sourceRef}`)
        .digest('hex')
        .slice(0, 40);
      batch.set(users.doc(uid).collection('synced').doc(id), {
        connectorId: source.connectorId,
        accountId: SITE_ACCOUNT_ID,
        grantId: source.grantId,
        category: copy.category,
        kind: copy.kind,
        sourceRef: copy.sourceRef,
        startAt: copy.startAt,
        endAt: copy.endAt ?? null,
        isAllDay: copy.isAllDay ?? copy.startAt !== null,
        dueAt: copy.dueAt,
        calendarKey: null,
        isBusy: null,
        sourceUpdatedAt: syncedAt - DAY_MS,
        contentHash: `seed-${id}`,
        syncedAt: endedAt ?? syncedAt,
        transformVersion: 1,
        connectionEndedAt: endedAt,
        deleteAfter: endedAt === null ? null : endedAt + 90 * DAY_MS,
        sealed: sealForHelm(
          { ...data, keyVersion: 1 },
          {
            title: copy.title,
            subtitle: copy.subtitle,
            detail: null,
            placeLabel: copy.placeLabel ?? null,
            amountCents: null,
            currency: null,
            deepLink: copy.deepLink,
            extra: copy.extra ?? {},
          },
        ),
      });
    });
  };

  const pinchGrant: ConnectionGrant = {
    readerAppId: 'helm',
    connectorId: pinchConnectorId,
    accountId: SITE_ACCOUNT_ID,
    categories: {
      plannedMeals: { isOn: true, changedAt: connectedAt },
      shoppingList: { isOn: true, changedAt: connectedAt },
      useSoon: { isOn: false, changedAt: connectedAt },
    },
    options: null,
    status: 'live',
    categoryState: Object.fromEntries(
      PINCH_SHARES.shares.flatMap((share) =>
        share.categories.map((category) => {
          const count = copyDefinitions.filter(
            (copy) => copy.category === category.id,
          ).length;
          return [
            category.id,
            count > 0
              ? { lastOkAt: syncedAt, lastError: null, count }
              : { lastOkAt: null, lastError: null, count: 0 },
          ];
        }),
      ),
    ),
    errors: [],
    newCategoryIds: [],
    lastSyncAt: syncedAt,
    syncLeaseUntil: null,
    keptCopies: null,
    createdAt: connectedAt,
    updatedAt: connectedAt,
    endedAt: null,
  };
  batch.set(
    context.firestore
      .collection('connections')
      .doc(FIXTURE_USERS.partnerOne.uid)
      .collection('grants')
      .doc(pinchGrantId),
    pinchGrant,
  );
  writeCopies(FIXTURE_USERS.partnerOne.uid, copyDefinitions, null);

  const aListConnectorId = toAppConnectorId('a-list');
  const aListGrantId = toGrantId('helm', aListConnectorId, SITE_ACCOUNT_ID);
  const aListCopies: CopyDefinition[] = [
    {
      category: 'plannedShowings',
      sourceRef: 'viewings/seed-viewing-starlight',
      kind: 'event',
      title: 'Starlight Harbor',
      subtitle: null,
      startAt: getShowtime(context.now, 4),
      endAt: getShowtime(context.now, 4) + 2.5 * 60 * MINUTE_MS,
      isAllDay: false,
      dueAt: null,
      placeLabel: 'AMC Dine-In Mission Valley 20',
      deepLink: '/a-list?viewing=seed-viewing-starlight',
    },
    {
      category: 'plannedShowings',
      sourceRef: 'viewings/seed-viewing-galaxy',
      kind: 'event',
      title: 'Galaxy Drift',
      subtitle: null,
      startAt: getShowtime(context.now, 25),
      endAt: getShowtime(context.now, 25) + 3 * 60 * MINUTE_MS,
      isAllDay: false,
      dueAt: null,
      placeLabel: 'AMC Town Center 20',
      deepLink: '/a-list?viewing=seed-viewing-galaxy',
    },
    {
      category: 'savedTheaters',
      sourceRef: 'theatres/2078',
      kind: 'place',
      title: 'AMC Dine-In Mission Valley 20',
      subtitle: null,
      startAt: null,
      dueAt: null,
      extra: { address: '5000 Metcalf Ave, Overland Park, KS 66202' },
      deepLink: '/a-list',
    },
    {
      category: 'savedTheaters',
      sourceRef: 'theatres/2105',
      kind: 'place',
      title: 'AMC Town Center 20',
      subtitle: null,
      startAt: null,
      dueAt: null,
      extra: { address: '4701 Town Center Dr, Leawood, KS 66211' },
      deepLink: '/a-list',
    },
  ];
  const aListGrant: ConnectionGrant = {
    readerAppId: 'helm',
    connectorId: aListConnectorId,
    accountId: SITE_ACCOUNT_ID,
    categories: {
      plannedShowings: { isOn: true, changedAt: connectedAt },
      savedTheaters: { isOn: true, changedAt: connectedAt },
      seenMovies: { isOn: false, changedAt: connectedAt },
    },
    options: null,
    status: 'live',
    categoryState: Object.fromEntries(
      A_LIST_SHARES.shares.flatMap((share) =>
        share.categories.map((category) => {
          const count = aListCopies.filter(
            (copy) => copy.category === category.id,
          ).length;
          return [
            category.id,
            count > 0
              ? { lastOkAt: syncedAt, lastError: null, count }
              : { lastOkAt: null, lastError: null, count: 0 },
          ];
        }),
      ),
    ),
    errors: [],
    newCategoryIds: [],
    lastSyncAt: syncedAt,
    syncLeaseUntil: null,
    keptCopies: null,
    createdAt: connectedAt,
    updatedAt: connectedAt,
    endedAt: null,
  };
  batch.set(
    context.firestore
      .collection('connections')
      .doc(FIXTURE_USERS.partnerOne.uid)
      .collection('grants')
      .doc(aListGrantId),
    aListGrant,
  );
  writeCopies(FIXTURE_USERS.partnerOne.uid, aListCopies, null, {
    connectorId: aListConnectorId,
    grantId: aListGrantId,
  });

  const goingOnceConnectorId = toAppConnectorId('going-once');
  const goingOnceGrantId = toGrantId(
    'helm',
    goingOnceConnectorId,
    SITE_ACCOUNT_ID,
  );
  const goingOnceSaleRef = 'sales/seed-going-once-fall-clear-out';
  const goingOnceCopies: CopyDefinition[] = [
    {
      category: 'pickups',
      sourceRef: `${goingOnceSaleRef}/items/seed-go-oak-desk`,
      kind: 'event',
      title: 'Oak desk',
      subtitle: 'Fall clear-out',
      startAt: getSeedPickupOn(context.now, 'saturday'),
      isAllDay: true,
      dueAt: null,
      deepLink: '/going-once',
    },
    {
      category: 'sales',
      sourceRef: goingOnceSaleRef,
      kind: 'project',
      title: 'Fall clear-out',
      subtitle: null,
      startAt: null,
      dueAt: null,
      extra: { available: 8, pending: 2, sold: 3 },
      deepLink: '/going-once',
    },
  ];
  const goingOnceGrant: ConnectionGrant = {
    readerAppId: 'helm',
    connectorId: goingOnceConnectorId,
    accountId: SITE_ACCOUNT_ID,
    categories: {
      pickups: { isOn: true, changedAt: connectedAt },
      sales: { isOn: true, changedAt: connectedAt },
    },
    options: null,
    status: 'live',
    categoryState: Object.fromEntries(
      GOING_ONCE_SHARES.shares.flatMap((share) =>
        share.categories.map((category) => [
          category.id,
          {
            lastOkAt: syncedAt,
            lastError: null,
            count: goingOnceCopies.filter(
              (copy) => copy.category === category.id,
            ).length,
          },
        ]),
      ),
    ),
    errors: [],
    newCategoryIds: [],
    lastSyncAt: syncedAt,
    syncLeaseUntil: null,
    keptCopies: null,
    createdAt: connectedAt,
    updatedAt: connectedAt,
    endedAt: null,
  };
  batch.set(
    context.firestore
      .collection('connections')
      .doc(FIXTURE_USERS.partnerOne.uid)
      .collection('grants')
      .doc(goingOnceGrantId),
    goingOnceGrant,
  );
  writeCopies(FIXTURE_USERS.partnerOne.uid, goingOnceCopies, null, {
    connectorId: goingOnceConnectorId,
    grantId: goingOnceGrantId,
  });

  const googleConnectorId = 'google:calendar';
  const googleAccount: ConnectionAccount = {
    provider: 'google',
    email: GOOGLE_PRIMARY_CALENDAR,
    label: null,
    grantedScopes: [CALENDAR_READ_SCOPE],
    status: 'live',
    connectedAt,
    lastError: null,
  };
  const googleGrant: ConnectionGrant = {
    readerAppId: 'helm',
    connectorId: googleConnectorId,
    accountId: GOOGLE_ACCOUNT_ID,
    categories: { events: { isOn: true, changedAt: connectedAt } },
    options: { calendarIds: [GOOGLE_PRIMARY_CALENDAR, GOOGLE_SHIFTS_CALENDAR] },
    status: 'live',
    categoryState: { events: { lastOkAt: null, lastError: null, count: 0 } },
    errors: [],
    newCategoryIds: [],
    lastSyncAt: null,
    syncLeaseUntil: null,
    keptCopies: null,
    createdAt: connectedAt,
    updatedAt: connectedAt,
    endedAt: null,
  };
  const alexConnections = context.firestore
    .collection('connections')
    .doc(FIXTURE_USERS.partnerOne.uid);
  batch.set(
    alexConnections.collection('accounts').doc(GOOGLE_ACCOUNT_ID),
    googleAccount,
  );
  batch.set(
    alexConnections
      .collection('grants')
      .doc(toGrantId('helm', googleConnectorId, GOOGLE_ACCOUNT_ID)),
    googleGrant,
  );
  batch.set(
    context.firestore
      .collection('connectionsServer')
      .doc(FIXTURE_USERS.partnerOne.uid)
      .collection('tokens')
      .doc(GOOGLE_ACCOUNT_ID),
    {
      isFixture: true,
      grantedScopes: [CALENDAR_READ_SCOPE],
      createdAt: connectedAt,
      lastRefreshedAt: null,
    },
  );

  const endedAt = context.now - 10 * DAY_MS;
  const keptDefinitions = [
    copyDefinitions[0],
    copyDefinitions[1],
    copyDefinitions[3],
  ];
  batch.set(
    context.firestore
      .collection('connections')
      .doc(FIXTURE_USERS.partnerTwo.uid)
      .collection('grants')
      .doc(pinchGrantId),
    {
      ...pinchGrant,
      status: 'ended',
      categoryState: Object.fromEntries(
        Object.entries(pinchGrant.categoryState).map(([id, state]) => [
          id,
          {
            ...state,
            lastOkAt: state.lastOkAt === null ? null : endedAt,
            count: keptDefinitions.filter((copy) => copy.category === id)
              .length,
          },
        ]),
      ),
      lastSyncAt: endedAt,
      keptCopies: {
        count: keptDefinitions.length,
        deleteAfter: endedAt + 90 * DAY_MS,
      },
      createdAt: endedAt - 3 * DAY_MS,
      updatedAt: endedAt,
      endedAt,
    } satisfies ConnectionGrant,
  );
  writeCopies(FIXTURE_USERS.partnerTwo.uid, keptDefinitions, endedAt);

  Object.keys(keyring.keys).forEach((masterKeyId) =>
    batch.set(
      context.firestore.doc(keyCheckPath(masterKeyId)),
      makeKeyCheck(keyring, masterKeyId, createdAt),
    ),
  );
  await batch.commit();

  // Per person: the profile, the wrapped key and their turns with what was made of them; one canary per master key; then each connection, its copies and any account and token.
  const result = {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments:
      SEED_PROFILES.length * 2 +
      turnCounts.reduce((total, count) => total + count, 0) +
      Object.keys(keyring.keys).length +
      2 +
      3 +
      copyDefinitions.length +
      keptDefinitions.length +
      1 +
      aListCopies.length +
      1 +
      goingOnceCopies.length,
  };
  return result;
}
