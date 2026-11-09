import { wrapDataKey } from '../../functions/src/appKeys/wrap.ts';
import {
  deriveSeedDataKey,
  keyCheckPath,
  makeKeyCheck,
  wrappedKeyPath,
} from '../../functions/src/apps/helm/helmKey.ts';
import {
  DEFAULT_DAY_END_TIME,
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_DAY_START_TIME,
  DEFAULT_PLAN_FILL_PERCENT,
} from '../../src/apps/helm/constants.ts';
import { sealJson } from '../../src/apps/helm/security.ts';
import { readCapture } from '../../src/apps/helm/utils/captureReading.ts';
import type {
  Capture,
  CaptureSealed,
  Execution,
  ExecutionSealed,
  HelmEncryption,
  Task,
  TaskDue,
  TaskSealed,
} from '../../src/apps/helm/types.ts';
import { readEmulatorKeyring } from './runway.ts';
import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

// Alex keeps Pacific Time, so the first open shows a profile that was made earlier; Jamie's zone differs from the emulator's.
const SEED_PROFILES = [
  { user: FIXTURE_USERS.partnerOne, timeZone: 'America/Los_Angeles' },
  { user: FIXTURE_USERS.partnerTwo, timeZone: 'America/New_York' },
];

const SORT_DELAY_MS = 4_000;

/** What the assistant made of each sorted turn, by the turn's place in `SEED_TURNS`: a task's title and the words of the turn its day was read from. The first turn is left as saved, so home shows both kinds of line. */
const SEED_TASKS: Record<number, { title: string; dueWords: string | null }[]> =
  {
    1: [{ title: 'Lunch with Sam', dueWords: 'Thursday' }],
    2: [{ title: 'Call Grandpa about the wedding questions', dueWords: null }],
    3: [
      { title: 'Buy the rings', dueWords: null },
      { title: 'Call Dana', dueWords: 'Friday' },
    ],
  };

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
] as const;

const dueFrom = (
  dates: { text: string; due: TaskDue }[],
  words: string | null,
) =>
  words === null
    ? null
    : (dates.find((span) =>
        span.text.toLowerCase().includes(words.toLowerCase()),
      )?.due ?? null);

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
        hasSeenAiNotice: false,
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

      const turns = await Promise.all(
        SEED_TURNS.map(async (turn, index) => {
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
          const isSorted = sortedTasks.length > 0;
          const sortedAt = turnTime + SORT_DELAY_MS;
          const capture: Capture = {
            inputMode: 'typed',
            medium: 'web',
            sessionId: `seed-${user.uid}-${turn.session}`,
            turnIndex: SEED_TURNS.filter(
              (entry) => entry.session === turn.session,
            ).indexOf(turn),
            route: isSorted ? 'quick' : null,
            status: isSorted ? 'sorted' : 'received',
            heldReason: null,
            claimId: null,
            claimedAt: null,
            attempts: 0,
            lastErrorCode: null,
            executionIds: isSorted ? [executionId] : [],
            seenAt: turn.isSeen ? turnTime + MINUTE_MS : null,
            createdAt: turnTime,
            sortedAt: isSorted ? sortedAt : null,
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
          const execution: Execution | null = isSorted
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
                    effects: sortedTasks.map(({ title, due }) => ({
                      written: {
                        'sealed.title': title,
                        due,
                        status: 'open',
                        isUrgent: false,
                      },
                      previous: null,
                    })),
                    undoReport: null,
                  },
                  encryption,
                ),
              }
            : null;
          return {
            id: `seed-turn-${index + 1}`,
            capture,
            tasks,
            execution,
            executionId,
          };
        }),
      );
      const person = users.doc(user.uid);
      turns.forEach(({ id, capture, tasks, execution, executionId }) => {
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
      });
      return turns.reduce(
        (total, turn) =>
          total + 1 + turn.tasks.length + (turn.execution ? 1 : 0),
        0,
      );
    }),
  );

  Object.keys(keyring.keys).forEach((masterKeyId) =>
    batch.set(
      context.firestore.doc(keyCheckPath(masterKeyId)),
      makeKeyCheck(keyring, masterKeyId, createdAt),
    ),
  );
  await batch.commit();

  // Per person: the profile and the wrapped key, then their turns with what was made of them (tasks and executions); one canary per master key.
  const result = {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments:
      SEED_PROFILES.length * 2 +
      turnCounts.reduce((total, count) => total + count, 0) +
      Object.keys(keyring.keys).length,
  };
  return result;
}
