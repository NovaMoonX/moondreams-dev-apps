import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import {
  dayKeyToMs,
  msToDayKey,
  shiftDayKeyBy,
} from '../../../vendor/cadenceUtils.js';
import { zonedDateTimeToEpoch } from '../../../notifications/zonedTime.js';
import { readAssistantName } from '../assistantName.js';
import { DEFAULT_ASSISTANT_NAME } from '../nomos/commands.js';
import { HABIT_DAY_ROLLOVER } from '../nomos/habitDay.js';
import {
  judgeHabitWeek,
  readWeekKey,
  rejudgeHabit,
  type HabitStagePatch,
} from '../nomos/habitLife.js';
import {
  HABIT_REMINDER_WORDS,
  HABIT_REMINDERS_IDLE_DAYS,
  diffSlots,
  planHabitDay,
  reminderBody,
  type WantedSlot,
} from '../nomos/habitReminders.js';
import { cancelSlots } from './reminderQueue.js';
import {
  HABITS_READ,
  HABIT_HISTORY_MAX,
  queuePath,
  readClock,
  readDays,
  readHabit,
  readProfile,
  readQueue,
  userPath,
  type PlanHabit,
  type QueueDoc,
  type QueueSlot,
} from './readRecords.js';

if (getApps().length === 0) {
  initializeApp();
}

const MINUTE = 60_000;
const LOOK_AHEAD = 5 * MINUTE;
const CHANGED_BEHIND = 24 * 60 * MINUTE;
const RETRY_AFTER = 15 * MINUTE;
const CHANGED_AHEAD = 10 * MINUTE;
const LEASE = 2 * MINUTE;
const PEOPLE_MAX = 300;
const DUE_RESERVED = 100;
const AT_ONCE = 20;
const STOP_STARTING_AFTER = 200_000;
const WEEK = 7;
const JUDGED_WEEKS = 16;
const REMINDER_LINK = '/helm?view=today';

export interface PlanningReport {
  people: number;
  planned: number;
  skipped: number;
  failed: number;
  created: number;
  cancelled: number;
}

const errorCode = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' || typeof code === 'number'
    ? code
    : 'unknown';
};

const clockTag = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(at))
    .replace(':', '');

const holdsLease = async (
  transaction: Transaction,
  ref: DocumentReference,
  leaseUntil: number,
) => readQueue((await transaction.get(ref)).data()).leaseUntil === leaseUntil;

const leaseQueue = (firestore: Firestore, uid: string, now: number) =>
  firestore.runTransaction(async (transaction) => {
    const ref = firestore.doc(queuePath(uid));
    const snap = await transaction.get(ref);
    const queue = readQueue(snap.data());
    if (queue.leaseUntil !== null && queue.leaseUntil > now) return null;
    transaction.set(ref, { leaseUntil: now + LEASE }, { merge: true });
    return queue;
  });

interface Goal {
  id: string;
  status: string;
  pausedAt: number | null;
  pausedUntil: number | null;
}

const readGoals = async (
  firestore: Firestore,
  uid: string,
  habits: PlanHabit[],
): Promise<Goal[]> => {
  const ids = [
    ...new Set(
      habits.flatMap((habit) =>
        habit.status === 'paused' && habit.projectId ? [habit.projectId] : [],
      ),
    ),
  ];
  if (ids.length === 0) return [];
  const snaps = await firestore.getAll(
    ...ids.map((id) => firestore.doc(`${userPath(uid)}/projects/${id}`)),
  );
  return snaps.flatMap((snap) => {
    const data = snap.data() ?? {};
    return snap.exists
      ? [
          {
            id: snap.id,
            status: typeof data.status === 'string' ? data.status : 'active',
            pausedAt: typeof data.pausedAt === 'number' ? data.pausedAt : null,
            pausedUntil:
              typeof data.pausedUntil === 'number' ? data.pausedUntil : null,
          },
        ]
      : [];
  });
};

const isPauseOver = (
  item: { status: string; pausedUntil?: number | null },
  dayKey: string,
) =>
  item.status === 'paused' &&
  item.pausedUntil != null &&
  item.pausedUntil <= dayKeyToMs(dayKey);

/** Ends a goal's due pause and its habits' own, each in a transaction that checks it is still paused; returns the habits and goals as they now stand. */
const endPauses = async (
  firestore: Firestore,
  uid: string,
  habits: PlanHabit[],
  dayKey: string,
  now: number,
): Promise<{ habits: PlanHabit[]; goals: Goal[] }> => {
  const goals = await readGoals(firestore, uid, habits);
  const endedGoals = (
    await Promise.all(
      goals
        .filter((goal) => isPauseOver(goal, dayKey))
        .map((goal) =>
          firestore.runTransaction(async (transaction) => {
            const ref = firestore.doc(`${userPath(uid)}/projects/${goal.id}`);
            const snap = await transaction.get(ref);
            if (snap.get('status') !== 'paused') return [];
            transaction.update(ref, {
              status: 'active',
              pausedAt: null,
              pausedUntil: null,
            });
            return [goal];
          }),
        ),
    )
  ).flat();
  const isDue = (habit: PlanHabit) =>
    habit.status === 'paused' &&
    (isPauseOver(habit, dayKey) ||
      endedGoals.some(
        (goal) =>
          goal.id === habit.projectId &&
          goal.pausedAt !== null &&
          goal.pausedAt === habit.pausedAt,
      ));
  const resumed = await Promise.all(
    habits.map(async (habit) => {
      if (!isDue(habit)) return habit;
      const history = await firestore.runTransaction(async (transaction) => {
        const ref = firestore.doc(`${userPath(uid)}/habits/${habit.id}`);
        const snap = await transaction.get(ref);
        if (snap.get('status') !== 'paused') return null;
        const next = [
          ...readHabit(habit.id, snap.data() ?? {}, 'UTC').history,
          { kind: 'resumed', at: now, by: 'nomos', pace: null, stage: null },
        ].slice(-HABIT_HISTORY_MAX);
        transaction.update(ref, {
          status: 'active',
          pausedAt: null,
          pausedUntil: null,
          history: next,
          untoldSince: now,
        });
        return next;
      });
      return history === null
        ? habit
        : {
            ...habit,
            status: 'active',
            pausedAt: null,
            pausedUntil: null,
            history,
            untoldSince: now,
          };
    }),
  );
  return {
    habits: resumed,
    goals: goals.map((goal) =>
      endedGoals.some((ended) => ended.id === goal.id)
        ? { ...goal, status: 'active', pausedAt: null, pausedUntil: null }
        : goal,
    ),
  };
};

/** Writes a stage patch on the habit only while the guard still holds on the document: a week not yet judged, or a late check-in still waiting. */
const writeStage = async (
  firestore: Firestore,
  uid: string,
  habit: PlanHabit,
  patch: HabitStagePatch,
  guard: (data: DocumentData) => boolean,
  now: number,
): Promise<PlanHabit> => {
  const history = await firestore.runTransaction(async (transaction) => {
    const ref = firestore.doc(`${userPath(uid)}/habits/${habit.id}`);
    const snap = await transaction.get(ref);
    if (!snap.exists || !guard(snap.data() ?? {})) return null;
    const stored = readHabit(habit.id, snap.data() ?? {}, 'UTC').history;
    const next = patch.event
      ? [...stored, patch.event].slice(-HABIT_HISTORY_MAX)
      : stored;
    transaction.update(ref, {
      stage: patch.stage,
      stageAt: patch.stageAt,
      stageWeek: patch.stageWeek,
      formedAt: patch.formedAt,
      ...(patch.isStageChange && patch.stage === 'formed'
        ? { formedKeptAt: null, formedKeptCount: 0 }
        : {}),
      rejudgeFrom: null,
      ...(patch.event ? { history: next } : {}),
      ...(patch.isStageChange ? { untoldSince: now } : {}),
    });
    return next;
  });
  return history === null
    ? habit
    : {
        ...habit,
        stage: patch.stage,
        stageAt: patch.stageAt,
        stageWeek: patch.stageWeek,
        formedAt: patch.formedAt,
        rejudgeFrom: null,
        history,
        untoldSince: patch.isStageChange ? now : habit.untoldSince,
      };
};

const isJudgedLate = (habit: PlanHabit, lastWeek: string) =>
  habit.status === 'active' &&
  habit.forWhoId === null &&
  (habit.stageWeek === null ||
    habit.stageWeek < lastWeek ||
    habit.rejudgeFrom !== null);

/** The next instant this person must be looked at: the coming rollover while any habit reminds, or sooner for a pause that ends; null when neither. */
const readLookAt = (
  habits: PlanHabit[],
  goals: Goal[],
  dayKey: string,
  timeZone: string,
  at: number,
): number | null => {
  const pauseEnds = [...habits, ...goals].flatMap((item) =>
    item.status === 'paused' && item.pausedUntil != null
      ? [
          zonedDateTimeToEpoch(
            msToDayKey(item.pausedUntil),
            HABIT_DAY_ROLLOVER,
            timeZone,
          ),
        ]
      : [],
  );
  const reminds = habits.some(
    (habit) => habit.status === 'active' && habit.reminder?.isOn === true,
  );
  const rollover = zonedDateTimeToEpoch(
    shiftDayKeyBy(dayKey, 1),
    HABIT_DAY_ROLLOVER,
    timeZone,
  );
  return (
    [...pauseEnds, ...(reminds ? [rollover] : [])]
      .filter((candidate) => candidate > at)
      .sort((first, second) => first - second)[0] ?? null
  );
};

const habitCount = (refs: string[]) =>
  new Set(refs.map((ref) => ref.split('/')[0])).size;

/** A planned reminder: fixed words, habit and window ids only, never a name. */
export const buildReminderDoc = (input: {
  id: string;
  uid: string;
  title: string;
  slot: WantedSlot;
  now: number;
}) => ({
  id: input.id,
  appId: 'helm',
  targetUids: [input.uid],
  title: input.title,
  body:
    input.slot.kind === 'idle'
      ? HABIT_REMINDER_WORDS.idle
      : reminderBody({
          part: input.slot.part,
          count: habitCount(input.slot.refs),
        }),
  scheduledFor: input.slot.fireAt,
  status: 'pending',
  channels: ['push'],
  relatedEntityPath: null,
  link: REMINDER_LINK,
  recurrence: 'none',
  inAppToast: null,
  lastSentAt: null,
  createdBy: input.uid,
  createdAt: input.now,
  subjectRefs: input.slot.refs,
});

/** Plans one person's habit day: ends due pauses, judges stages on a new week, then brings the day's reminders to what is wanted. It reads and writes readable fields only. Returns the reminders created and cancelled, or null when another run holds the person. */
export async function planPerson(
  firestore: Firestore,
  uid: string,
  now: number,
): Promise<{ created: number; cancelled: number } | null> {
  const queue = await leaseQueue(firestore, uid, now);
  if (queue === null) return null;
  const queueRef = firestore.doc(queuePath(uid));
  const profileSnap = await firestore.doc(userPath(uid)).get();
  if (!profileSnap.exists) {
    const cancelled = await cancelSlots(firestore, Object.values(queue.slots));
    await queueRef.delete();
    return { created: 0, cancelled };
  }
  const profile = readProfile(profileSnap.data() ?? {});
  const planAt =
    queue.lookAt !== null &&
    queue.lookAt > now &&
    queue.lookAt <= now + LOOK_AHEAD
      ? queue.lookAt
      : now;
  const { dayKey, timeZone } = readClock(planAt, profile);
  const habitsSnap = await firestore
    .collection(`${userPath(uid)}/habits`)
    .where('status', 'in', ['active', 'paused'])
    .limit(HABITS_READ)
    .get();
  if (habitsSnap.size === HABITS_READ)
    logger.warn('helm.reminders.habitsTruncated', { who: uid.slice(0, 4) });
  const read = habitsSnap.docs.map((doc) =>
    readHabit(doc.id, doc.data(), timeZone),
  );
  const currentWeek = readWeekKey(dayKey);
  const lastWeek = shiftDayKeyBy(currentWeek, -WEEK);
  const earliest = read.some((habit) => isJudgedLate(habit, lastWeek))
    ? shiftDayKeyBy(currentWeek, -WEEK * JUDGED_WEEKS)
    : shiftDayKeyBy(dayKey, -Math.max(14, HABIT_REMINDERS_IDLE_DAYS ?? 0) + 1);
  const [days, ended] = await Promise.all([
    readDays(firestore, uid, earliest, dayKey),
    endPauses(firestore, uid, read, dayKey, planAt),
  ]);
  const habits = await Promise.all(
    ended.habits.map(async (habit) => {
      if (!isJudgedLate(habit, lastWeek)) return habit;
      const patch = judgeHabitWeek(habit, days, lastWeek, timeZone);
      if (patch)
        return writeStage(
          firestore,
          uid,
          habit,
          patch,
          (data) => data.stageWeek == null || data.stageWeek < lastWeek,
          planAt,
        );
      const late = rejudgeHabit(habit, days, timeZone);
      return late
        ? writeStage(
            firestore,
            uid,
            habit,
            late,
            (data) => typeof data.rejudgeFrom === 'string',
            planAt,
          )
        : habit;
    }),
  );
  const wanted = planHabitDay({
    now: planAt,
    dayKey,
    profile: { ...profile, timeZone },
    habits,
    days,
  });
  const { create, cancel } = diffSlots(
    Object.values(queue.slots).map((slot) => ({
      id: slot.reminderId,
      fireAt: slot.fireAt,
      refs: slot.refs,
    })),
    wanted,
    planAt,
  );
  const isLastReminderKept = (slot: QueueSlot) =>
    slot.refs.length === 0 &&
    profile.habitRemindersIdleAt !== null &&
    profile.remindersPausedAt === null;
  const isCancelled = (slot: QueueSlot) =>
    !isLastReminderKept(slot) &&
    cancel.some((one) => one.id === slot.reminderId);
  const cancelled = await cancelSlots(
    firestore,
    Object.values(queue.slots).filter(isCancelled),
  );
  const made = create.map((slot) => ({
    slot,
    id: firestore.collection('reminders').doc().id,
  }));
  const next: QueueDoc = {
    lookAt: readLookAt(habits, ended.goals, dayKey, timeZone, planAt),
    plannedAt: planAt,
    plannedFor: profile.habitRemindersChangedAt,
    leaseUntil: null,
    retryAt: null,
    dayKey,
    stageWeek: habits.some((habit) => habit.forWhoId === null)
      ? lastWeek
      : queue.stageWeek,
    slots: Object.fromEntries([
      ...Object.entries(queue.slots).filter(
        ([, slot]) => slot.fireAt > planAt && !isCancelled(slot),
      ),
      ...made.map(({ slot, id }): [string, QueueSlot] => [
        `${dayKey}_${clockTag(slot.fireAt, timeZone)}`,
        {
          reminderId: id,
          fireAt: slot.fireAt,
          refs: slot.refs,
          part: slot.part,
        },
      ]),
    ]),
  };
  const title =
    readAssistantName(profile.assistantName) ?? DEFAULT_ASSISTANT_NAME;
  const isWritten = await firestore.runTransaction(async (transaction) => {
    if (!(await holdsLease(transaction, queueRef, now + LEASE))) return false;
    made.forEach(({ slot, id }) =>
      transaction.set(
        firestore.doc(`reminders/${id}`),
        buildReminderDoc({ id, uid, title, slot, now: planAt }),
      ),
    );
    if (made.some(({ slot }) => slot.kind === 'idle'))
      transaction.update(firestore.doc(userPath(uid)), {
        habitRemindersIdleAt: planAt,
      });
    transaction.set(queueRef, next);
    return true;
  });
  return isWritten ? { created: made.length, cancelled } : null;
}

const planGroups = async (
  firestore: Firestore,
  groups: string[][],
  now: number,
  startedAt: number,
  report: PlanningReport,
): Promise<PlanningReport> => {
  if (groups.length === 0 || Date.now() - startedAt > STOP_STARTING_AFTER)
    return report;
  const results = await Promise.all(
    groups[0].map((uid) =>
      planPerson(firestore, uid, now).catch(async (error) => {
        logger.error('helm.reminders.planFailed', {
          who: uid.slice(0, 4),
          code: errorCode(error),
        });
        const ref = firestore.doc(queuePath(uid));
        await firestore
          .runTransaction(async (transaction) => {
            if (await holdsLease(transaction, ref, now + LEASE))
              transaction.set(
                ref,
                {
                  lookAt: now + RETRY_AFTER,
                  retryAt: now + RETRY_AFTER,
                  leaseUntil: null,
                },
                { merge: true },
              );
          })
          .catch(() => undefined);
        return 'failed' as const;
      }),
    ),
  );
  return planGroups(firestore, groups.slice(1), now, startedAt, {
    ...report,
    planned:
      report.planned + results.filter((one) => one && one !== 'failed').length,
    skipped: report.skipped + results.filter((one) => one === null).length,
    failed: report.failed + results.filter((one) => one === 'failed').length,
    created: results.reduce(
      (sum, one) => sum + (one && one !== 'failed' ? one.created : 0),
      report.created,
    ),
    cancelled: results.reduce(
      (sum, one) => sum + (one && one !== 'failed' ? one.cancelled : 0),
      report.cancelled,
    ),
  });
};

/** One planning pass as of `now`: the people whose planning time has come plus those whose reminders changed in the last day and are not yet planned, at most 300, 20 at a time, no new person after 200 seconds. */
export async function runHelmReminderPlanning(
  firestore: Firestore,
  now: number,
): Promise<PlanningReport> {
  const startedAt = Date.now();
  const [dueSnap, changedSnap] = await Promise.all([
    firestore
      .collection('apps/helm/reminderQueue')
      .where('lookAt', '<=', now + LOOK_AHEAD)
      .orderBy('lookAt')
      .limit(PEOPLE_MAX)
      .get(),
    firestore
      .collection('apps/helm/users')
      .where('habitRemindersChangedAt', '>=', now - CHANGED_BEHIND)
      .where('habitRemindersChangedAt', '<=', now + CHANGED_AHEAD)
      .orderBy('habitRemindersChangedAt', 'desc')
      .limit(PEOPLE_MAX)
      .get(),
  ]);
  const dueIds = dueSnap.docs.map((doc) => doc.id);
  const changed = changedSnap.docs.filter((doc) => !dueIds.includes(doc.id));
  const queues =
    changed.length === 0
      ? []
      : await firestore.getAll(
          ...changed.map((doc) => firestore.doc(queuePath(doc.id))),
        );
  const pending = changed.filter(
    (doc, at) =>
      readQueue(queues[at].data()).plannedFor !==
      doc.get('habitRemindersChangedAt'),
  );
  const waiting = pending.filter((doc) => {
    const retryAt = readQueue(queues[changed.indexOf(doc)].data()).retryAt;
    return retryAt === null || retryAt <= now;
  });
  const uids = [
    ...waiting
      .slice(0, PEOPLE_MAX - Math.min(dueIds.length, DUE_RESERVED))
      .map((doc) => doc.id),
    ...dueIds,
  ].slice(0, PEOPLE_MAX);
  return planGroups(
    firestore,
    Array.from({ length: Math.ceil(uids.length / AT_ONCE) }, (_, at) =>
      uids.slice(at * AT_ONCE, (at + 1) * AT_ONCE),
    ),
    now,
    startedAt,
    {
      people: uids.length,
      planned: 0,
      skipped: changed.length - waiting.length,
      failed: 0,
      created: 0,
      cancelled: 0,
    },
  );
}

export const planHelmReminders = onSchedule(
  {
    schedule: '*/5 * * * *',
    timeoutSeconds: 240,
  },
  async () => {
    const report = await runHelmReminderPlanning(getFirestore(), Date.now());
    logger.info('helm.reminders.planned', report);
  },
);

export default planHelmReminders;
