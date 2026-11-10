import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

import { wrapDataKey } from '../../functions/src/appKeys/wrap.ts';
import { createDigest } from '../../functions/src/apps/helm/nomos/contactImport.ts';
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
import { openJson, sealBytes, sealJson } from '../../src/apps/helm/security.ts';
import { getMediaObjectPath } from '../../src/apps/helm/utils/mediaPath.ts';
import {
  getDueDay,
  readCapture,
} from '../../src/apps/helm/utils/captureReading.ts';
import type {
  Capture,
  CaptureSealed,
  Execution,
  ExecutionSealed,
  CaptureAnswer,
  Fact,
  FactSealed,
  Media,
  MediaSealed,
  Place,
  PlaceSealed,
  Who,
  WhoSealed,
  ScreenContext,
  HelmEncryption,
  PlanDaySealed,
  PlanSlot,
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
import { NINE_LIVES_SHARES } from '../../functions/src/apps/nine-lives/share/manifest.ts';
import { PINCH_SHARES } from '../../functions/src/apps/pinch/share/manifest.ts';
import { WAYPOINT_SHARES } from '../../functions/src/apps/waypoint/share/manifest.ts';
import { WORTH_THE_WAIT_SHARES } from '../../functions/src/apps/worth-the-wait/share/manifest.ts';
import { zonedDateTimeToEpoch } from '../../functions/src/notifications/zonedTime.ts';
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
  kind: 'event' | 'task' | 'place' | 'project' | 'pet' | 'trip';
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
const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const DRIVE_READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const CONTACTS_READ_SCOPE = 'https://www.googleapis.com/auth/contacts.readonly';
const GOOGLE_CALENDAR_GRANT_ID = toGrantId(
  'helm',
  'google:calendar',
  GOOGLE_ACCOUNT_ID,
);
const CAKE_SOURCE_REF = `${GOOGLE_PRIMARY_CALENDAR}|fx-cake-tasting`;
const CAKE_COPY_ID = createHash('sha256')
  .update(`${GOOGLE_CALENDAR_GRANT_ID}|events|${CAKE_SOURCE_REF}`)
  .digest('hex')
  .slice(0, 40);
const NIGHT_SHIFT_SOURCE_REF = `${GOOGLE_SHIFTS_CALENDAR}|fx-night-shift`;
const NIGHT_SHIFT_COPY_ID = createHash('sha256')
  .update(`${GOOGLE_CALENDAR_GRANT_ID}|events|${NIGHT_SHIFT_SOURCE_REF}`)
  .digest('hex')
  .slice(0, 40);
const CAKE_TITLE = 'Cake tasting at Sweet Layer Bakery';
const CAKE_ZONE = 'America/Los_Angeles';
const GMAIL_GATE_ID = 'google-mail-and-drive';

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
    usedIds: new Set(),
    now,
  });
  if (result.kind !== 'write')
    throw new Error('The seeded undo has no writes.');
  return {
    tasks: tasks.filter(
      ({ id }) => !result.deletes.some((entry) => entry.docId === id),
    ),
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
    linkedWhoIds: [],
    linkedPlaceIds: [],
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
        answersQuestion: null,
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
        quotedSourceKeys: [],
        whoIds: [],
        placeIds: [],
        planDayKey: null,
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
            answer: null,
            questionAnswer: null,
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
    linkedWhoIds: [],
    linkedPlaceIds: [],
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

const PINCH_CONNECTOR_ID = toAppConnectorId('pinch');
const PINCH_GRANT_ID = toGrantId('helm', PINCH_CONNECTOR_ID, SITE_ACCOUNT_ID);

// Date-only meals land on the person's own day, which can differ from the UTC day.
const getSeedToday = (now: number) =>
  Date.parse(
    `${new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })}T00:00:00Z`,
  );

const getCopyId = (category: string, sourceRef: string) =>
  createHash('sha256')
    .update(`${PINCH_GRANT_ID}|${category}|${sourceRef}`)
    .digest('hex')
    .slice(0, 40);

const ANSWER_TASKS = [
  {
    id: 'seed-task-answer-cake',
    title: 'Cake tasting at Sweet Layer Bakery',
    dueDays: 3,
  },
  {
    id: 'seed-task-answer-dinner',
    title: "Ask Dana's parents about the rehearsal dinner",
    dueDays: 9,
  },
  {
    id: 'seed-task-answer-refill',
    title: "Refill Mom's metoprolol",
    dueDays: 1,
  },
];

const EMPTY_ANSWER = {
  sources: [],
  general: null,
  isHealth: false,
  generalDiffersFrom: null,
  suggestedTopicId: null,
  quotes: [],
  searched: [],
} satisfies Partial<CaptureAnswer>;

const toAnswerSummary = (answer: CaptureAnswer) => {
  if (answer.fromRecords !== null) return `Answered: ${answer.question}`;
  return answer.general !== null
    ? `Answered from general knowledge: ${answer.question}`
    : `No answer in your records: ${answer.question}`;
};

/** One turn of each kind of answer, in a session of their own. */
const buildAnswers = (now: number): CaptureAnswer[] => {
  const today = getSeedToday(now);
  const cakeDay = new Date(
    today + ANSWER_TASKS[0].dueDays * DAY_MS,
  ).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return [
    {
      ...EMPTY_ANSWER,
      question: 'When is the cake tasting?',
      scope: 'yourThings',
      fromRecords: `The cake tasting is on ${cakeDay}, at Sweet Layer Bakery.`,
      sources: [{ kind: 'task', id: ANSWER_TASKS[0].id }],
    },
    {
      ...EMPTY_ANSWER,
      question: "What's for dinner tomorrow?",
      scope: 'yourThings',
      fromRecords: 'Lemon pasta is planned for dinner tomorrow.',
      sources: [
        {
          kind: 'synced',
          id: getCopyId('plannedMeals', 'plannedMeals/seed-meal-1'),
          connectorId: PINCH_CONNECTOR_ID,
          title: 'Lemon pasta',
          startAt: today + DAY_MS,
        },
      ],
    },
    {
      ...EMPTY_ANSWER,
      question: 'Who pays for the rehearsal dinner?',
      scope: 'both',
      fromRecords:
        "There's a task to ask Dana's parents about the rehearsal dinner.",
      sources: [{ kind: 'task', id: ANSWER_TASKS[1].id }],
      general:
        "Traditionally the groom's family hosts it, but many couples now share it between both families or host it themselves.",
    },
    {
      ...EMPTY_ANSWER,
      question: "What's Dana's number?",
      scope: 'yourThings',
      fromRecords: null,
    },
    {
      ...EMPTY_ANSWER,
      question: 'How long does cake keep?',
      scope: 'theWorld',
      fromRecords: null,
      general:
        'A frosted cake usually keeps 3 to 4 days in the fridge, covered. Cream or fresh fruit fillings are best within 2 days.',
    },
    {
      ...EMPTY_ANSWER,
      question: 'Can Mom take ibuprofen with her metoprolol?',
      scope: 'both',
      fromRecords:
        "There's a task to refill Mom's metoprolol, and nothing about ibuprofen.",
      sources: [{ kind: 'task', id: ANSWER_TASKS[2].id }],
      general:
        'Ibuprofen and similar pain relievers can raise blood pressure and may make metoprolol work less well.',
      isHealth: true,
    },
  ];
};

const toCakeTimes = (now: number) => {
  const date = new Date(getSeedToday(now) + 3 * DAY_MS)
    .toISOString()
    .slice(0, 10);
  return {
    startAt: zonedDateTimeToEpoch(date, '15:00', CAKE_ZONE),
    endAt: zonedDateTimeToEpoch(date, '16:00', CAKE_ZONE),
  };
};

// Tonight 7:30 PM to tomorrow 7:30 AM, so tomorrow is a rest day and today stays a normal one.
const toNightShiftTimes = (now: number) => {
  const today = getSeedToday(now);
  const dateOf = (offset: number) =>
    new Date(today + offset * DAY_MS).toISOString().slice(0, 10);
  return {
    startAt: zonedDateTimeToEpoch(dateOf(0), '19:30', CAKE_ZONE),
    endAt: zonedDateTimeToEpoch(dateOf(1), '07:30', CAKE_ZONE),
  };
};

/** A question the assistant answered by looking in Gmail: the quote, the search line, the fact it noted about the calendar copy of the tasting. */
async function buildGmailTurn(input: {
  uid: string;
  now: number;
  timeZone: string;
  encryption: HelmEncryption;
}) {
  const { uid, now, timeZone, encryption } = input;
  const { startAt } = toCakeTimes(now);
  const createdAt = now - 24 * MINUTE_MS;
  const sortedAt = createdAt + SORT_DELAY_MS;
  const question = 'What time is the tasting?';
  const factId = 'seed-fact-cake-time';
  const executionId = 'seed-execution-answer-gmail';
  const note = 'Noted the 2:00 PM on Cake tasting';
  const answer: CaptureAnswer = {
    ...EMPTY_ANSWER,
    question,
    scope: 'yourThings',
    fromRecords:
      "Your calendar has the cake tasting at 3:00 PM. An email from Sweet Layer Bakery says 2:00 PM, so it's worth checking with them.",
    sources: [
      {
        kind: 'synced',
        id: CAKE_COPY_ID,
        connectorId: 'google:calendar',
        title: CAKE_TITLE,
        startAt,
      },
    ],
    quotes: [
      {
        id: 'seed-quote-cake',
        connectorId: 'google:gmail',
        accountId: GOOGLE_ACCOUNT_ID,
        sourceLabel: 'Email from Sweet Layer Bakery',
        at: now - 2 * DAY_MS,
        text: 'Your cake tasting is at 2:00 PM. See you then!',
        deepLink:
          'https://mail.google.com/mail/?authuser=personal@example.com#all/18f0c0de00000001',
        deletedAt: null,
      },
    ],
    searched: [
      {
        connectorId: 'google:gmail',
        accountId: GOOGLE_ACCOUNT_ID,
        label: `Gmail (${GOOGLE_PRIMARY_CALENDAR})`,
        at: sortedAt,
        found: 1,
        failed: null,
      },
    ],
  };
  const capture: Capture = {
    inputMode: 'typed',
    sttProvider: null,
    interruptedCaptureId: null,
    answersQuestion: null,
    ttsProvider: null,
    medium: 'web',
    sessionId: `seed-${uid}-answers`,
    turnIndex: 6,
    route: 'quick',
    status: 'sorted',
    heldReason: null,
    claimId: null,
    claimedAt: null,
    attempts: 0,
    lastErrorCode: null,
    questionState: {},
    executionIds: [executionId],
    turnLeadId: null,
    joinedCaptureIds: [],
    seenAt: createdAt + MINUTE_MS,
    quotedSourceKeys: [`google:gmail|${GOOGLE_ACCOUNT_ID}`],
    whoIds: [],
    placeIds: [],
    planDayKey: null,
    createdAt,
    sortedAt,
    screen: null,
    sealed: await sealJson<CaptureSealed>(
      {
        text: question,
        reading: readCapture(question, {
          now: createdAt,
          timeZone,
          assistantName: DEFAULT_ASSISTANT_NAME,
        }),
        answer,
        questionAnswer: null,
      },
      encryption,
    ),
  };
  const execution: Execution = {
    captureId: 'seed-turn-answer-gmail',
    actor: 'nomos',
    category: 'remember',
    autonomyLevel: 2,
    state: 'succeeded',
    effectRefs: [{ op: 'create', collection: 'facts', docId: factId }],
    linkedWhoIds: [],
    linkedPlaceIds: [],
    undoesExecutionId: null,
    undoneByExecutionId: null,
    questionRef: null,
    errorCode: null,
    createdAt: sortedAt,
    decidedAt: sortedAt,
    finishedAt: sortedAt,
    sealed: await sealJson<ExecutionSealed>(
      {
        summary: toAnswerSummary(answer),
        commands: [],
        effects: [
          {
            written: {
              'sealed.title': note,
              status: 'inferred',
              aboutField: 'startAt',
            },
            previous: null,
          },
        ],
        undoReport: null,
        spoken: null,
        goneIds: null,
      },
      encryption,
    ),
  };
  const fact: Fact = {
    status: 'inferred',
    stated: 'nomosInferred',
    kind: 'world',
    occurredOn: null,
    sourceCaptureId: 'seed-turn-answer-gmail',
    sourceExecutionId: executionId,
    sourceConnection: {
      connectorId: 'google:gmail',
      accountId: GOOGLE_ACCOUNT_ID,
      quoteId: 'seed-quote-cake',
    },
    aboutField: 'startAt',
    whoIds: [],
    placeIds: [],
    projectIds: [],
    syncedIds: [CAKE_COPY_ID],
    subjectIds: [],
    keptOverSource: null,
    supersedesId: null,
    supersededById: null,
    supersededAt: null,
    disputedWithId: null,
    createdAt: sortedAt,
    confirmedAt: null,
    lastEditedAt: null,
    sealed: await sealJson<FactSealed>(
      {
        statement: "Sweet Layer Bakery's email says the tasting is at 2:00 PM",
        quote: 'Your cake tasting is at 2:00 PM.',
        value: '2:00 PM',
      },
      encryption,
    ),
  };
  return { capture, execution, executionId, fact, factId };
}

async function buildAnswerTurns(input: {
  uid: string;
  now: number;
  timeZone: string;
  encryption: HelmEncryption;
}) {
  const { uid, now, timeZone, encryption } = input;
  const today = getDueDay({ kind: 'moment', at: now }, timeZone);
  const answers = buildAnswers(now);
  const turns = await Promise.all(
    answers.map(async (answer, order) => {
      const createdAt = now - (45 - order * 3) * MINUTE_MS;
      const sortedAt = createdAt + SORT_DELAY_MS;
      const captureId = `seed-turn-answer-${order + 1}`;
      const executionId = `seed-execution-answer-${order + 1}`;
      const capture: Capture = {
        inputMode: 'typed',
        sttProvider: null,
        interruptedCaptureId: null,
        answersQuestion: null,
        ttsProvider: null,
        medium: 'web',
        sessionId: `seed-${uid}-answers`,
        turnIndex: order,
        route: 'quick',
        status: 'sorted',
        heldReason: null,
        claimId: null,
        claimedAt: null,
        attempts: 0,
        lastErrorCode: null,
        questionState: {},
        executionIds: [executionId],
        turnLeadId: null,
        joinedCaptureIds: [],
        seenAt: createdAt + MINUTE_MS,
        quotedSourceKeys: [],
        whoIds: [],
        placeIds: [],
        planDayKey: null,
        createdAt,
        sortedAt,
        screen: null,
        sealed: await sealJson<CaptureSealed>(
          {
            text: answer.question,
            reading: readCapture(answer.question, {
              now: createdAt,
              timeZone,
              assistantName: DEFAULT_ASSISTANT_NAME,
            }),
            answer,
            questionAnswer: null,
          },
          encryption,
        ),
      };
      const execution: Execution = {
        captureId,
        actor: 'nomos',
        category: 'answer',
        autonomyLevel: 1,
        state: 'succeeded',
        effectRefs: [],
        linkedWhoIds: [],
        linkedPlaceIds: [],
        undoesExecutionId: null,
        undoneByExecutionId: null,
        questionRef: null,
        errorCode: null,
        createdAt: sortedAt,
        decidedAt: sortedAt,
        finishedAt: sortedAt,
        sealed: await sealJson<ExecutionSealed>(
          {
            summary: toAnswerSummary(answer),
            commands: [],
            effects: [],
            undoReport: null,
            spoken: null,
            goneIds: null,
          },
          encryption,
        ),
      };
      return { captureId, capture, executionId, execution };
    }),
  );
  const tasks = await Promise.all(
    ANSWER_TASKS.map(async (entry, order) => {
      const made = now - (order + 4) * 60 * MINUTE_MS;
      const task: Task = {
        status: 'open',
        importance: null,
        isUrgent: false,
        due: { kind: 'day', date: today + entry.dueDays * DAY_MS },
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
        createdBy: 'person',
        sourceCaptureId: null,
        executionId: null,
        createdAt: made,
        lastEditedAt: null,
        completedAt: null,
        sealed: await sealJson<TaskSealed>(
          { title: entry.title, notes: null, steps: {} },
          encryption,
        ),
      };
      return { id: entry.id, task };
    }),
  );
  return { turns, tasks };
}

/** Alex's plan days: yesterday as it was (one event, one kept task done that day and one not) and today (one kept slot and one suggestion), with the done task they need. */
async function buildPlanDays(input: {
  now: number;
  timeZone: string;
  encryption: HelmEncryption;
}) {
  const { now, timeZone, encryption } = input;
  const todayKey = new Date(getDueDay({ kind: 'moment', at: now }, timeZone))
    .toISOString()
    .slice(0, 10);
  const yesterdayKey = new Date(Date.parse(todayKey) - DAY_MS)
    .toISOString()
    .slice(0, 10);
  const at = (key: string, time: string) =>
    zonedDateTimeToEpoch(key, time, timeZone);
  const slot = (
    taskId: string,
    key: string,
    from: string,
    to: string,
    source: PlanSlot['source'],
  ): PlanSlot => ({
    taskId,
    startAt: at(key, from),
    endAt: at(key, to),
    status: 'kept',
    source,
    decidedAt: at(key, from) - 2 * 60 * MINUTE_MS,
  });
  const doneTitle = "Send RSVP for Priya's party";
  const doneTask: Task = {
    status: 'done',
    importance: null,
    isUrgent: false,
    due: null,
    durationMinutes: 30,
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
    createdBy: 'person',
    sourceCaptureId: null,
    executionId: null,
    createdAt: now - 3 * DAY_MS,
    lastEditedAt: at(yesterdayKey, '14:25'),
    completedAt: at(yesterdayKey, '14:25'),
    sealed: await sealJson<TaskSealed>(
      { title: doneTitle, notes: null, steps: {} },
      encryption,
    ),
  };
  const day = async (
    key: string,
    generatedAt: number,
    slots: Record<string, PlanSlot>,
    sealed: PlanDaySealed,
  ) => ({
    id: key,
    day: {
      date: Date.parse(key),
      slots,
      isRestDay: false,
      restDayOverriddenAt: null,
      generatedAt,
      calendarReadAt: generatedAt,
      sealed: await sealJson<PlanDaySealed>(sealed, encryption),
    },
  });
  const days = await Promise.all([
    day(
      yesterdayKey,
      at(yesterdayKey, '08:05'),
      {
        'seed-slot-yesterday-1': slot(
          'seed-task-plan-done',
          yesterdayKey,
          '14:00',
          '14:30',
          'nomos',
        ),
        'seed-slot-yesterday-2': slot(
          'seed-task-3-1',
          yesterdayKey,
          '16:00',
          '16:20',
          'person',
        ),
      },
      {
        reasons: {
          'seed-slot-yesterday-1': '30 min · fits after the venue walk-through',
          'seed-slot-yesterday-2': '20 min · due soon',
        },
        calendarSnapshot: [
          {
            eventRef: 'seed-snapshot-walkthrough',
            title: 'Venue walk-through',
            startAt: at(yesterdayKey, '11:00'),
            endAt: at(yesterdayKey, '12:00'),
            isAllDay: false,
          },
        ],
      },
    ),
    day(
      todayKey,
      now - 3 * 60 * MINUTE_MS,
      {
        'seed-slot-today-1': slot(
          'seed-task-hand-2',
          todayKey,
          '10:00',
          '10:15',
          'nomos',
        ),
        'seed-slot-today-2': {
          ...slot('seed-task-hand-5', todayKey, '14:00', '14:30', 'nomos'),
          status: 'suggested',
          decidedAt: null,
        },
      },
      {
        reasons: {
          'seed-slot-today-1': '15 min · due in 2 days',
          'seed-slot-today-2':
            'about 30 min · estimate · fits after Lunch with Sam',
        },
        calendarSnapshot: [],
      },
    ),
  ]);
  return { days, task: { id: 'seed-task-plan-done', task: doneTask } };
}

const toWho = (
  fields: Pick<Who, 'kind' | 'tier' | 'tierSetBy' | 'isSelf' | 'createdBy'> &
    Partial<Pick<Who, 'lastMentionedAt'>>,
  createdAt: number,
  sealed: Who['sealed'],
): Who => ({
  placeIds: [],
  photoMediaId: null,
  mediaIds: [],
  importedFrom: null,
  importedFields: {},
  lastMentionedAt: null,
  yearlyDateCount: 0,
  momentCount: 0,
  executionId: null,
  createdAt,
  lastEditedAt: null,
  ...fields,
  sealed,
});

const wordsOf = (name: string, extra: Partial<WhoSealed> = {}): WhoSealed => ({
  name,
  aliases: [],
  relation: null,
  phone: null,
  email: null,
  notes: null,
  species: null,
  organizationKind: null,
  ...extra,
});

function makeSquarePng(
  size: number,
  [red, green, blue]: [number, number, number],
) {
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: size }, () => [red, green, blue]).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const crcTable = Array.from({ length: 256 }, (_, n) =>
    Array.from({ length: 8 }).reduce<number>(
      (c) => (c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1),
      n,
    ),
  );
  const crc = (buffer: Buffer) =>
    (buffer.reduce(
      (c, byte) => crcTable[(c ^ byte) & 0xff] ^ (c >>> 8),
      0xffffffff,
    ) ^
      0xffffffff) >>>
    0;
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** One kept photo of a who or place: a flat-colour PNG sealed with the person's key, its document and the two sealed objects to upload. */
async function buildSeedPhoto(input: {
  uid: string;
  id: string;
  attachedTo: Media['attachedTo'][number];
  color: [number, number, number];
  now: number;
  encryption: HelmEncryption;
}) {
  const { uid, id, attachedTo, color, now, encryption } = input;
  const png = new Uint8Array(makeSquarePng(96, color));
  const [bytes, thumb] = await Promise.all([
    sealBytes(png, encryption),
    sealBytes(png, encryption),
  ]);
  const media: Media = {
    kind: 'photo',
    role: 'photo',
    status: 'kept',
    mimeType: 'image/png',
    hasThumb: true,
    attachedTo: [attachedTo],
    decidedBy: 'person',
    createdAt: now - 5 * DAY_MS,
    decidedAt: now - 5 * DAY_MS,
    deleteAfter: null,
    sealed: await sealJson<MediaSealed>(
      {
        bytesNonce: bytes.nonce,
        thumbNonce: thumb.nonce,
        keyId: encryption.keyId,
      },
      encryption,
    ),
  };
  return {
    id,
    media,
    uploads: [
      { path: getMediaObjectPath(uid, id, false), bytes: bytes.bytes },
      { path: getMediaObjectPath(uid, id, true), bytes: thumb.bytes },
    ],
  };
}

/** Uploads a seeded sealed object to the Storage emulator; a bucket the app isn't configured for leaves the photo unreadable. */
async function uploadSealedSeed(path: string, bytes: Uint8Array) {
  const bucket =
    process.env.STORAGE_BUCKET ??
    process.env.VITE_FIREBASE_STORAGE_BUCKET ??
    'moondreams-dev-apps.firebasestorage.app';
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199';
  const response = await fetch(
    `http://${host}/v0/b/${bucket}/o?name=${encodeURIComponent(path)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        Authorization: 'Bearer owner',
      },
      body: Buffer.from(bytes),
    },
  ).catch(() => null);
  if (!response?.ok) {
    console.warn(
      'Helm seed: could not upload a photo to the Storage emulator, so Miso and Home show their marks.',
    );
  }
}

/** Alex's people: themself, two Sams, Dana, a cat and a bakery, five facts on Dana, Sam and Home, the turn that said Dana's, a home, three tasks that link them, a turn that names the second Sam and a waiting turn that asks which Sam. */
async function buildPeople(input: {
  uid: string;
  displayName: string;
  now: number;
  timeZone: string;
  encryption: HelmEncryption;
}) {
  const { uid, displayName, now, timeZone, encryption } = input;
  const madeAt = now - 6 * DAY_MS;
  const seal = <T extends object>(fields: T) => sealJson<T>(fields, encryption);
  const digest = createDigest(Buffer.from(encryption.key, 'hex'));
  const misoPhoto = await buildSeedPhoto({
    uid,
    id: 'seed-media-miso',
    attachedTo: { kind: 'who', id: 'seed-who-miso' },
    color: [226, 148, 72],
    now,
    encryption,
  });
  const homePhoto = await buildSeedPhoto({
    uid,
    id: 'seed-media-home',
    attachedTo: { kind: 'place', id: 'seed-place-home' },
    color: [96, 130, 170],
    now,
    encryption,
  });
  const names = {
    self: displayName.includes('@') || !displayName ? 'Me' : displayName,
  };
  const who: { id: string; who: Who }[] = [
    {
      id: 'self',
      who: toWho(
        {
          kind: 'person',
          tier: 'close',
          tierSetBy: 'person',
          isSelf: true,
          createdBy: 'person',
        },
        madeAt,
        await seal(wordsOf(names.self)),
      ),
    },
    {
      id: 'seed-who-sam-rivera',
      who: toWho(
        {
          kind: 'person',
          tier: 'regular',
          tierSetBy: 'nomos',
          isSelf: false,
          createdBy: 'nomos',
          lastMentionedAt: now - 3 * DAY_MS,
        },
        madeAt,
        await seal(
          wordsOf('Sam Rivera', {
            relation: 'work friend',
            email: 'sam.rivera@example.com',
          }),
        ),
      ),
    },
    {
      id: 'seed-who-dana',
      who: toWho(
        {
          kind: 'person',
          tier: 'regular',
          tierSetBy: 'nomos',
          isSelf: false,
          createdBy: 'nomos',
          lastMentionedAt: now - 3 * DAY_MS,
        },
        madeAt,
        await seal(wordsOf('Dana')),
      ),
    },
    {
      id: 'seed-who-priya-raman',
      who: {
        ...toWho(
          {
            kind: 'person',
            tier: 'regular',
            tierSetBy: 'person',
            isSelf: false,
            createdBy: 'person',
          },
          now - DAY_MS,
          await seal(wordsOf('Priya Raman', { email: 'priya@example.com' })),
        ),
        importedFrom: {
          connectorId: 'google:contacts',
          accountId: GOOGLE_ACCOUNT_ID,
          resourceName: 'people/c1000000004',
          importedAt: now - DAY_MS,
        },
        importedFields: {
          name: digest('name', 'Priya Raman'),
          email: digest('email', 'priya@example.com'),
        },
      },
    },
    {
      id: 'seed-who-sam-patel',
      who: toWho(
        {
          kind: 'person',
          tier: 'passing',
          tierSetBy: 'nomos',
          isSelf: false,
          createdBy: 'nomos',
          lastMentionedAt: now - 2 * DAY_MS,
        },
        now - 2 * DAY_MS,
        await seal(wordsOf('Sam Patel', { relation: 'neighbor' })),
      ),
    },
    {
      id: 'seed-who-miso',
      who: toWho(
        {
          kind: 'pet',
          tier: 'regular',
          tierSetBy: 'nomos',
          isSelf: false,
          createdBy: 'nomos',
          lastMentionedAt: now - 4 * DAY_MS,
        },
        madeAt,
        await seal(wordsOf('Miso', { species: 'Cat' })),
      ),
    },
    {
      id: 'seed-who-acme-bakery',
      who: toWho(
        {
          kind: 'organization',
          tier: 'passing',
          tierSetBy: 'nomos',
          isSelf: false,
          createdBy: 'nomos',
          lastMentionedAt: now - 5 * DAY_MS,
        },
        madeAt,
        await seal(wordsOf('Acme Bakery', { organizationKind: 'Bakery' })),
      ),
    },
  ];
  const home: Place = {
    isHome: true,
    photoMediaIds: [],
    createdBy: 'person',
    executionId: null,
    createdAt: madeAt,
    lastEditedAt: null,
    sealed: await seal<PlaceSealed>({
      name: 'Home',
      aliases: [],
      address: null,
      notes: null,
    }),
  };
  const taskOf = async (
    title: string,
    links: Pick<Task, 'whoIds' | 'placeIds'>,
    order: number,
  ): Promise<{ id: string; task: Task }> => ({
    id: `seed-task-who-${order}`,
    task: {
      status: 'open',
      importance: null,
      isUrgent: false,
      due: null,
      durationMinutes: null,
      energy: null,
      context: null,
      projectId: null,
      milestoneId: null,
      ...links,
      notUntil: null,
      waitsOnTaskIds: [],
      waitsOnWhoId: null,
      stepState: {},
      mediaIds: [],
      createdBy: 'person',
      sourceCaptureId: null,
      executionId: null,
      createdAt: now - (order + 3) * DAY_MS,
      lastEditedAt: null,
      completedAt: null,
      sealed: await seal<TaskSealed>({ title, notes: null, steps: {} }),
    },
  });
  const tasks = await Promise.all([
    taskOf("Buy Miso's food", { whoIds: ['seed-who-miso'], placeIds: [] }, 1),
    taskOf(
      'Send Sam the slides',
      { whoIds: ['seed-who-sam-rivera'], placeIds: [] },
      2,
    ),
    taskOf(
      'Water the plants',
      { whoIds: [], placeIds: ['seed-place-home'] },
      3,
    ),
    taskOf('Lunch with Sam', { whoIds: [], placeIds: [] }, 4),
    taskOf(
      'Swap the winter coats',
      { whoIds: [], placeIds: ['seed-place-home'] },
      5,
    ),
  ]);
  const questionTaskId = 'seed-task-who-4';
  const questionText = 'Lunch with Sam Friday';
  const questionAt = now - 20 * MINUTE_MS;
  const question = {
    kind: 'whichPerson',
    builtBy: 'code',
    shape: 'pickOne',
    prompt: 'Which Sam?',
    options: [
      {
        id: 'seed-who-sam-rivera',
        label: 'Sam Rivera',
        detail: 'Work friend',
        ref: { collection: 'who', id: 'seed-who-sam-rivera' },
      },
      {
        id: 'seed-who-sam-patel',
        label: 'Sam Patel',
        detail: 'Neighbor',
        ref: { collection: 'who', id: 'seed-who-sam-patel' },
      },
      { id: 'new', label: 'Someone new', detail: null, ref: null },
      { id: 'none', label: "Don't link anyone", detail: null, ref: null },
    ],
    allowsSomethingElse: false,
    noneOption: false,
    recordKinds: [],
    dateMode: null,
    number: null,
    heldCommands: [
      {
        kind: 'linkWho',
        taskIds: [questionTaskId],
        mention: {
          name: 'Sam',
          kind: 'person',
          relation: null,
          species: null,
          organizationKind: null,
        },
      },
    ],
    aboutRef: { collection: 'tasks', id: questionTaskId },
    answer: null,
  };
  const questionCapture: Capture = {
    inputMode: 'typed',
    sttProvider: null,
    interruptedCaptureId: null,
    answersQuestion: null,
    ttsProvider: null,
    medium: 'web',
    sessionId: 'seed-alex-question',
    turnIndex: 0,
    route: 'quick',
    status: 'needsYou',
    heldReason: null,
    claimId: null,
    claimedAt: null,
    attempts: 0,
    lastErrorCode: null,
    questionState: {
      'seed-question-which-sam': {
        kind: 'whichPerson',
        shape: 'pickOne',
        askedAt: questionAt + SORT_DELAY_MS,
        answeredAt: null,
        skippedAt: null,
      },
    },
    executionIds: [],
    turnLeadId: null,
    joinedCaptureIds: [],
    seenAt: null,
    quotedSourceKeys: [],
    whoIds: [],
    placeIds: [],
    createdAt: questionAt,
    sortedAt: questionAt + SORT_DELAY_MS,
    planDayKey: null,
    screen: null,
    sealed: await seal({
      text: questionText,
      reading: readCapture(questionText, {
        now: questionAt,
        timeZone,
        assistantName: DEFAULT_ASSISTANT_NAME,
      }),
      answer: null,
      questions: { 'seed-question-which-sam': question },
    }),
  };
  const askedText = 'Help me pack for the Tahoe trip';
  const askedAt = now - 8 * MINUTE_MS;
  const asked = (fields: Record<string, unknown>) => ({
    kind: 'asked',
    builtBy: 'model',
    allowsSomethingElse: false,
    noneOption: false,
    recordKinds: [],
    dateMode: null,
    number: null,
    heldCommands: [],
    aboutRef: null,
    answer: null,
    ...fields,
  });
  const packingQuestion = asked({
    shape: 'pickSeveral',
    prompt: 'Which of these should go on the packing list?',
    noneOption: true,
    options: [
      { id: 'o1', label: 'Snow chains', detail: null, ref: null },
      { id: 'o2', label: 'Sunscreen', detail: null, ref: null },
      { id: 'o3', label: 'Board games', detail: null, ref: null },
      { id: 'none', label: 'None of these', detail: null, ref: null },
    ],
  });
  const nightsQuestion = asked({
    shape: 'number',
    prompt: 'How many nights?',
    options: [],
    number: { min: 1, max: 30, unit: 'nights', isMoney: false, decimals: 0 },
  });
  const askedCapture: Capture = {
    inputMode: 'typed',
    sttProvider: null,
    interruptedCaptureId: null,
    answersQuestion: null,
    ttsProvider: null,
    medium: 'web',
    sessionId: 'seed-alex-asked',
    turnIndex: 0,
    route: 'quick',
    status: 'needsYou',
    heldReason: null,
    claimId: null,
    claimedAt: null,
    attempts: 0,
    lastErrorCode: null,
    questionState: {
      'seed-question-asked-packing': {
        kind: 'asked',
        shape: 'pickSeveral',
        askedAt: askedAt + SORT_DELAY_MS,
        answeredAt: null,
        skippedAt: null,
      },
      'seed-question-asked-nights': {
        kind: 'asked',
        shape: 'number',
        askedAt: askedAt + SORT_DELAY_MS + 1,
        answeredAt: null,
        skippedAt: null,
      },
    },
    executionIds: [],
    turnLeadId: null,
    joinedCaptureIds: [],
    seenAt: null,
    quotedSourceKeys: [],
    whoIds: [],
    placeIds: [],
    createdAt: askedAt,
    sortedAt: askedAt + SORT_DELAY_MS,
    planDayKey: null,
    screen: null,
    sealed: await seal({
      text: askedText,
      reading: readCapture(askedText, {
        now: askedAt,
        timeZone,
        assistantName: DEFAULT_ASSISTANT_NAME,
      }),
      answer: null,
      questionAnswer: null,
      questions: {
        'seed-question-asked-packing': packingQuestion,
        'seed-question-asked-nights': nightsQuestion,
      },
    }),
  };
  const text = 'Sam Patel might join us for lunch on Saturday';
  const turnAt = now - 2 * DAY_MS;
  const capture: Capture = {
    inputMode: 'typed',
    sttProvider: null,
    interruptedCaptureId: null,
    answersQuestion: null,
    ttsProvider: null,
    medium: 'web',
    sessionId: 'seed-alex-who',
    turnIndex: 0,
    route: 'quick',
    status: 'sorted',
    heldReason: null,
    claimId: null,
    claimedAt: null,
    attempts: 0,
    lastErrorCode: null,
    questionState: {},
    executionIds: [],
    turnLeadId: null,
    joinedCaptureIds: [],
    seenAt: turnAt + MINUTE_MS,
    quotedSourceKeys: [],
    whoIds: ['seed-who-sam-patel'],
    placeIds: [],
    createdAt: turnAt,
    sortedAt: turnAt + SORT_DELAY_MS,
    planDayKey: null,
    screen: null,
    sealed: await seal<CaptureSealed>({
      text,
      reading: readCapture(text, {
        now: turnAt,
        timeZone,
        assistantName: DEFAULT_ASSISTANT_NAME,
      }),
      answer: null,
      questionAnswer: null,
    }),
  };
  const factText = 'Dana is the florist, and she does the wedding flowers';
  const factAt = now - 4 * DAY_MS;
  const factCapture: Capture = {
    ...capture,
    sessionId: 'seed-alex-facts',
    turnIndex: 0,
    seenAt: factAt + MINUTE_MS,
    whoIds: ['seed-who-dana'],
    createdAt: factAt,
    sortedAt: factAt + SORT_DELAY_MS,
    sealed: await seal<CaptureSealed>({
      text: factText,
      reading: readCapture(factText, {
        now: factAt,
        timeZone,
        assistantName: DEFAULT_ASSISTANT_NAME,
      }),
      answer: null,
      questionAnswer: null,
    }),
  };
  const factOf = async (
    id: string,
    fields: Partial<Fact> &
      Pick<Fact, 'status' | 'stated' | 'createdAt'> & { statement: string },
    links: Pick<Fact, 'whoIds' | 'placeIds'>,
  ): Promise<{ id: string; fact: Fact }> => {
    const { statement, ...stored } = fields;
    return {
      id,
      fact: {
        kind: 'world',
        occurredOn: null,
        sourceCaptureId: null,
        sourceExecutionId: null,
        sourceConnection: null,
        aboutField: null,
        ...links,
        projectIds: [],
        syncedIds: [],
        subjectIds: [...links.whoIds, ...links.placeIds],
        keptOverSource: null,
        supersedesId: null,
        supersededById: null,
        supersededAt: null,
        disputedWithId: null,
        confirmedAt: null,
        lastEditedAt: null,
        ...stored,
        sealed: await seal<FactSealed>({
          statement,
          quote: id === 'seed-fact-dana-florist' ? 'Dana is the florist' : null,
          value: null,
        }),
      },
    };
  };
  const facts = await Promise.all([
    factOf(
      'seed-fact-dana-florist',
      {
        statement: 'Dana is the florist',
        status: 'confirmed',
        stated: 'personSaid',
        sourceCaptureId: 'seed-turn-fact-dana',
        createdAt: factAt,
        confirmedAt: factAt,
      },
      { whoIds: ['seed-who-dana'], placeIds: [] },
    ),
    factOf(
      'seed-fact-dana-flowers',
      {
        statement: 'Dana does the wedding flowers',
        status: 'inferred',
        stated: 'nomosInferred',
        sourceCaptureId: 'seed-turn-fact-dana',
        createdAt: factAt,
      },
      { whoIds: ['seed-who-dana'], placeIds: [] },
    ),
    factOf(
      'seed-fact-sam-acme',
      {
        statement: 'Sam works at Acme',
        status: 'superseded',
        stated: 'personSaid',
        createdAt: now - 5 * DAY_MS,
        confirmedAt: now - 5 * DAY_MS,
        supersededById: 'seed-fact-sam-bluefin',
        supersededAt: now - DAY_MS,
        lastEditedAt: now - DAY_MS,
      },
      { whoIds: ['seed-who-sam-rivera'], placeIds: [] },
    ),
    factOf(
      'seed-fact-sam-bluefin',
      {
        statement: 'Sam works at Bluefin',
        status: 'confirmed',
        stated: 'personCorrected',
        supersedesId: 'seed-fact-sam-acme',
        createdAt: now - DAY_MS,
        confirmedAt: now - DAY_MS,
      },
      { whoIds: ['seed-who-sam-rivera'], placeIds: [] },
    ),
    factOf(
      'seed-fact-home-key',
      {
        statement: 'The spare key is under the blue pot',
        status: 'confirmed',
        stated: 'personSaid',
        createdAt: now - 3 * DAY_MS,
        confirmedAt: now - 3 * DAY_MS,
      },
      { whoIds: [], placeIds: ['seed-place-home'] },
    ),
  ]);
  return {
    who: who.map((entry) =>
      entry.id === 'seed-who-miso'
        ? {
            ...entry,
            who: {
              ...entry.who,
              photoMediaId: misoPhoto.id,
              mediaIds: [misoPhoto.id],
            },
          }
        : entry,
    ),
    places: [
      {
        id: 'seed-place-home',
        place: { ...home, photoMediaIds: [homePhoto.id] },
      },
    ],
    media: [misoPhoto, homePhoto],
    tasks,
    capture: { id: 'seed-turn-who', capture },
    factCapture: { id: 'seed-turn-fact-dana', capture: factCapture },
    facts,
    questionCapture: { id: 'seed-turn-question', capture: questionCapture },
    askedCapture: { id: 'seed-turn-asked', capture: askedCapture },
  };
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
        selfWhoId: user.uid === FIXTURE_USERS.partnerOne.uid ? 'self' : null,
        currentPlace: null,
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
            answersQuestion: null,
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
            quotedSourceKeys: [],
            whoIds: [],
            placeIds: [],
            planDayKey: null,
            createdAt: turnTime,
            sortedAt: isSorted ? sortedAt : null,
            screen: isMove ? MOVE_SCREEN : null,
            sealed: await sealJson<CaptureSealed>(
              { text: turn.text, reading, answer: null, questionAnswer: null },
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
                linkedWhoIds: [],
                linkedPlaceIds: [],
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
      const answerTurns =
        user.uid === FIXTURE_USERS.partnerOne.uid
          ? await buildAnswerTurns({
              uid: user.uid,
              now: context.now,
              timeZone,
              encryption,
            })
          : { turns: [], tasks: [] };
      answerTurns.turns.forEach((entry) => {
        batch.set(
          person.collection('captures').doc(entry.captureId),
          entry.capture,
        );
        batch.set(
          person.collection('executions').doc(entry.executionId),
          entry.execution,
        );
      });
      answerTurns.tasks.forEach((entry) =>
        batch.set(person.collection('tasks').doc(entry.id), entry.task),
      );
      const gmailTurn =
        user.uid === FIXTURE_USERS.partnerOne.uid
          ? await buildGmailTurn({
              uid: user.uid,
              now: context.now,
              timeZone,
              encryption,
            })
          : null;
      if (gmailTurn) {
        batch.set(
          person.collection('captures').doc('seed-turn-answer-gmail'),
          gmailTurn.capture,
        );
        batch.set(
          person.collection('executions').doc(gmailTurn.executionId),
          gmailTurn.execution,
        );
        batch.set(
          person.collection('facts').doc(gmailTurn.factId),
          gmailTurn.fact,
        );
      }
      const planDays =
        user.uid === FIXTURE_USERS.partnerOne.uid
          ? await buildPlanDays({
              now: context.now,
              timeZone,
              encryption,
            })
          : null;
      if (planDays) {
        planDays.days.forEach((entry) =>
          batch.set(person.collection('planDays').doc(entry.id), entry.day),
        );
        batch.set(
          person.collection('tasks').doc(planDays.task.id),
          planDays.task.task,
        );
      }
      const people =
        user.uid === FIXTURE_USERS.partnerOne.uid
          ? await buildPeople({
              uid: user.uid,
              displayName: user.displayName,
              now: context.now,
              timeZone,
              encryption,
            })
          : null;
      if (people) {
        people.who.forEach((entry) =>
          batch.set(person.collection('who').doc(entry.id), entry.who),
        );
        people.places.forEach((entry) =>
          batch.set(person.collection('places').doc(entry.id), entry.place),
        );
        people.media.forEach((entry) =>
          batch.set(person.collection('media').doc(entry.id), entry.media),
        );
        await Promise.all(
          people.media.flatMap((entry) =>
            entry.uploads.map((upload) =>
              uploadSealedSeed(upload.path, upload.bytes),
            ),
          ),
        );
        people.tasks.forEach((entry) =>
          batch.set(person.collection('tasks').doc(entry.id), entry.task),
        );
        batch.set(
          person.collection('captures').doc(people.capture.id),
          people.capture.capture,
        );
        batch.set(
          person.collection('captures').doc(people.factCapture.id),
          people.factCapture.capture,
        );
        people.facts.forEach((entry) =>
          batch.set(person.collection('facts').doc(entry.id), entry.fact),
        );
        batch.set(
          person.collection('captures').doc(people.questionCapture.id),
          people.questionCapture.capture,
        );
        batch.set(
          person.collection('captures').doc(people.askedCapture.id),
          people.askedCapture.capture,
        );
      }
      const peopleCount = people
        ? people.who.length +
          people.places.length +
          people.media.length +
          people.tasks.length +
          people.facts.length +
          4
        : 0;
      const backToBackCount =
        peopleCount +
        backToBack.captures.length +
        backToBack.tasks.length +
        1 +
        answerTurns.turns.length * 2 +
        answerTurns.tasks.length +
        (gmailTurn ? 3 : 0) +
        (planDays ? planDays.days.length + 1 : 0);
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
  const pinchConnectorId = PINCH_CONNECTOR_ID;
  const pinchGrantId = PINCH_GRANT_ID;
  const today = getSeedToday(context.now);

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

  const nineLivesConnectorId = toAppConnectorId('nine-lives');
  const nineLivesGrantId = toGrantId(
    'helm',
    nineLivesConnectorId,
    SITE_ACCOUNT_ID,
  );
  const nineLivesHouseholdRef = 'households/seed-nine-lives-other-household';
  const nineLivesCopies: CopyDefinition[] = [
    {
      category: 'cats',
      sourceRef: `${nineLivesHouseholdRef}/cats/seed-cat-other-household`,
      kind: 'pet',
      title: 'Pixel',
      subtitle: null,
      startAt: null,
      dueAt: null,
      deepLink: '/nine-lives',
    },
    {
      category: 'dueCare',
      sourceRef: `${nineLivesHouseholdRef}/preventives/seed-preventive-other-household`,
      kind: 'task',
      title: 'Pixel: Advantage Multi',
      subtitle: 'Preventive due',
      startAt: null,
      isAllDay: true,
      dueAt: Math.floor((context.now + 30 * DAY_MS) / DAY_MS) * DAY_MS,
      deepLink: '/nine-lives',
    },
  ];
  const nineLivesGrant: ConnectionGrant = {
    readerAppId: 'helm',
    connectorId: nineLivesConnectorId,
    accountId: SITE_ACCOUNT_ID,
    categories: {
      cats: { isOn: true, changedAt: connectedAt },
      vetVisits: { isOn: true, changedAt: connectedAt },
      dueCare: { isOn: true, changedAt: connectedAt },
      clinics: { isOn: true, changedAt: connectedAt },
      conditions: { isOn: false, changedAt: connectedAt },
    },
    options: null,
    status: 'live',
    categoryState: Object.fromEntries(
      NINE_LIVES_SHARES.shares.flatMap((share) =>
        share.categories.map((category) => [
          category.id,
          {
            lastOkAt: syncedAt,
            lastError: null,
            count: nineLivesCopies.filter(
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
      .doc(nineLivesGrantId),
    nineLivesGrant,
  );
  writeCopies(FIXTURE_USERS.partnerOne.uid, nineLivesCopies, null, {
    connectorId: nineLivesConnectorId,
    grantId: nineLivesGrantId,
  });

  const waypointConnectorId = toAppConnectorId('waypoint');
  const waypointGrantId = toGrantId(
    'helm',
    waypointConnectorId,
    SITE_ACCOUNT_ID,
  );
  const waypointAnchor = new Date(context.now + 10 * DAY_MS);
  const waypointTripStart = Date.UTC(
    waypointAnchor.getUTCFullYear(),
    waypointAnchor.getUTCMonth(),
    waypointAnchor.getUTCDate(),
  );
  const waypointTripDate = waypointAnchor.toISOString().slice(0, 10);
  const waypointTripRef = 'trips/seed-waypoint-trip';
  const waypointCopies: CopyDefinition[] = [
    {
      category: 'trips',
      sourceRef: waypointTripRef,
      kind: 'trip',
      title: 'Pacific Northwest Weekend',
      subtitle: null,
      startAt: waypointTripStart,
      endAt: waypointTripStart + 3 * DAY_MS,
      isAllDay: true,
      placeLabel: 'Seattle',
      dueAt: null,
      deepLink: '/waypoint?trip=seed-waypoint-trip',
    },
    {
      category: 'itinerary',
      sourceRef: `${waypointTripRef}/events/seed-waypoint-flight`,
      kind: 'event',
      title: 'Flight DL 482',
      subtitle: 'Flight',
      startAt: zonedDateTimeToEpoch(
        waypointTripDate,
        '09:00',
        'America/New_York',
      ),
      endAt: zonedDateTimeToEpoch(waypointTripDate, '11:05', 'America/Chicago'),
      isAllDay: false,
      placeLabel: 'John F. Kennedy International Airport',
      dueAt: null,
      deepLink: '/waypoint?trip=seed-waypoint-trip',
    },
    {
      category: 'itinerary',
      sourceRef: `${waypointTripRef}/stays/seed-waypoint-seattle`,
      kind: 'event',
      title: 'Pike Place Suites',
      subtitle: 'Stay',
      startAt: zonedDateTimeToEpoch(
        waypointTripDate,
        '15:00',
        'America/Los_Angeles',
      ),
      endAt: zonedDateTimeToEpoch(
        new Date(waypointTripStart + 2 * DAY_MS).toISOString().slice(0, 10),
        '11:00',
        'America/Los_Angeles',
      ),
      isAllDay: false,
      placeLabel: 'Seattle, WA',
      dueAt: null,
      deepLink: '/waypoint?trip=seed-waypoint-trip',
    },
    {
      category: 'myTasks',
      sourceRef: `${waypointTripRef}/checklist/confirm-passports`,
      kind: 'task',
      title: 'Confirm passport expiration dates',
      subtitle: 'Pacific Northwest Weekend',
      startAt: null,
      isAllDay: true,
      dueAt: waypointTripStart,
      deepLink: '/waypoint?trip=seed-waypoint-trip',
    },
  ];
  const waypointGrant: ConnectionGrant = {
    readerAppId: 'helm',
    connectorId: waypointConnectorId,
    accountId: SITE_ACCOUNT_ID,
    categories: {
      trips: { isOn: true, changedAt: connectedAt },
      itinerary: { isOn: true, changedAt: connectedAt },
      myTasks: { isOn: true, changedAt: connectedAt },
      tripBalances: { isOn: false, changedAt: connectedAt },
    },
    options: null,
    status: 'live',
    categoryState: Object.fromEntries(
      WAYPOINT_SHARES.shares.flatMap((share) =>
        share.categories.map((category) => [
          category.id,
          {
            lastOkAt: syncedAt,
            lastError: null,
            count: waypointCopies.filter(
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
      .doc(waypointGrantId),
    waypointGrant,
  );
  writeCopies(FIXTURE_USERS.partnerOne.uid, waypointCopies, null, {
    connectorId: waypointConnectorId,
    grantId: waypointGrantId,
  });

  const worthTheWaitConnectorId = toAppConnectorId('worth-the-wait');
  const worthTheWaitGrantId = toGrantId(
    'helm',
    worthTheWaitConnectorId,
    SITE_ACCOUNT_ID,
  );
  const worthTheWaitGrant: ConnectionGrant = {
    readerAppId: 'helm',
    connectorId: worthTheWaitConnectorId,
    accountId: SITE_ACCOUNT_ID,
    categories: { boxCounts: { isOn: false, changedAt: connectedAt } },
    options: null,
    status: 'live',
    categoryState: Object.fromEntries(
      WORTH_THE_WAIT_SHARES.shares.flatMap((share) =>
        share.categories.map((category) => [
          category.id,
          { lastOkAt: syncedAt, lastError: null, count: 0 },
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
      .doc(worthTheWaitGrantId),
    worthTheWaitGrant,
  );

  const googleConnectorId = 'google:calendar';
  const googleAccount: ConnectionAccount = {
    provider: 'google',
    email: GOOGLE_PRIMARY_CALENDAR,
    label: null,
    grantedScopes: [
      CALENDAR_READ_SCOPE,
      GMAIL_READ_SCOPE,
      DRIVE_READ_SCOPE,
      CONTACTS_READ_SCOPE,
    ],
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
    categoryState: {
      events: { lastOkAt: syncedAt, lastError: null, count: 2 },
    },
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
    alexConnections
      .collection('grants')
      .doc(toGrantId('helm', 'google:gmail', GOOGLE_ACCOUNT_ID)),
    {
      ...googleGrant,
      connectorId: 'google:gmail',
      categories: { mail: { isOn: true, changedAt: connectedAt } },
      options: null,
      categoryState: { mail: { lastOkAt: null, lastError: null, count: 0 } },
      lastSyncAt: null,
    } satisfies ConnectionGrant,
  );
  batch.set(
    alexConnections
      .collection('grants')
      .doc(toGrantId('helm', 'google:drive', GOOGLE_ACCOUNT_ID)),
    {
      ...googleGrant,
      connectorId: 'google:drive',
      categories: { documents: { isOn: true, changedAt: connectedAt } },
      options: null,
      categoryState: {
        documents: { lastOkAt: null, lastError: null, count: 0 },
      },
      lastSyncAt: null,
    } satisfies ConnectionGrant,
  );
  batch.set(
    alexConnections
      .collection('grants')
      .doc(toGrantId('helm', 'google:contacts', GOOGLE_ACCOUNT_ID)),
    {
      ...googleGrant,
      connectorId: 'google:contacts',
      categories: { contacts: { isOn: true, changedAt: connectedAt } },
      options: null,
      categoryState: {
        contacts: { lastOkAt: null, lastError: null, count: 0 },
      },
      lastSyncAt: null,
    } satisfies ConnectionGrant,
  );
  const cakeTimes = toCakeTimes(context.now);
  const alexKey = deriveSeedDataKey(keyring, FIXTURE_USERS.partnerOne.uid);
  batch.set(
    users
      .doc(FIXTURE_USERS.partnerOne.uid)
      .collection('synced')
      .doc(CAKE_COPY_ID),
    {
      connectorId: googleConnectorId,
      accountId: GOOGLE_ACCOUNT_ID,
      grantId: GOOGLE_CALENDAR_GRANT_ID,
      category: 'events',
      kind: 'event',
      sourceRef: CAKE_SOURCE_REF,
      startAt: cakeTimes.startAt,
      endAt: cakeTimes.endAt,
      isAllDay: false,
      dueAt: null,
      calendarKey: `${GOOGLE_ACCOUNT_ID}/${GOOGLE_PRIMARY_CALENDAR}`,
      isBusy: true,
      sourceUpdatedAt: syncedAt - DAY_MS,
      contentHash: `seed-${CAKE_COPY_ID}`,
      syncedAt,
      transformVersion: 1,
      connectionEndedAt: null,
      deleteAfter: null,
      sealed: sealForHelm(
        { ...alexKey, keyVersion: 1 },
        {
          title: CAKE_TITLE,
          subtitle: null,
          detail: null,
          placeLabel: null,
          amountCents: null,
          currency: null,
          deepLink: null,
          extra: {
            calendarId: GOOGLE_PRIMARY_CALENDAR,
            isTentative: false,
            isFree: false,
          },
        },
      ),
    },
  );
  const nightShiftTimes = toNightShiftTimes(context.now);
  batch.set(
    users
      .doc(FIXTURE_USERS.partnerOne.uid)
      .collection('synced')
      .doc(NIGHT_SHIFT_COPY_ID),
    {
      connectorId: googleConnectorId,
      accountId: GOOGLE_ACCOUNT_ID,
      grantId: GOOGLE_CALENDAR_GRANT_ID,
      category: 'events',
      kind: 'event',
      sourceRef: NIGHT_SHIFT_SOURCE_REF,
      startAt: nightShiftTimes.startAt,
      endAt: nightShiftTimes.endAt,
      isAllDay: false,
      dueAt: null,
      calendarKey: `${GOOGLE_ACCOUNT_ID}/${GOOGLE_SHIFTS_CALENDAR}`,
      isBusy: true,
      sourceUpdatedAt: syncedAt - DAY_MS,
      contentHash: `seed-${NIGHT_SHIFT_COPY_ID}`,
      syncedAt,
      transformVersion: 1,
      connectionEndedAt: null,
      deleteAfter: null,
      sealed: sealForHelm(
        { ...alexKey, keyVersion: 1 },
        {
          title: 'Night shift',
          subtitle: null,
          detail: null,
          placeLabel: null,
          amountCents: null,
          currency: null,
          deepLink: null,
          extra: {
            calendarId: GOOGLE_SHIFTS_CALENDAR,
            isTentative: false,
            isFree: false,
          },
        },
      ),
    },
  );
  batch.set(
    context.firestore.doc('featureGates/helm'),
    {
      appId: 'helm',
      gates: {
        [GMAIL_GATE_ID]: {
          rollout: 'testing',
          alwaysOnUids: [FIXTURE_USERS.partnerOne.uid],
          alwaysOffUids: [],
          reason: 'Seeded: Alex tests Gmail and Drive',
          updatedAt: context.now,
        },
      },
    },
    { merge: true },
  );
  batch.set(
    context.firestore
      .collection('connectionsServer')
      .doc(FIXTURE_USERS.partnerOne.uid)
      .collection('tokens')
      .doc(GOOGLE_ACCOUNT_ID),
    {
      isFixture: true,
      grantedScopes: [
        CALENDAR_READ_SCOPE,
        GMAIL_READ_SCOPE,
        DRIVE_READ_SCOPE,
        CONTACTS_READ_SCOPE,
      ],
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
      goingOnceCopies.length +
      1 +
      nineLivesCopies.length +
      1 +
      waypointCopies.length +
      1 +
      6,
  };
  return result;
}
