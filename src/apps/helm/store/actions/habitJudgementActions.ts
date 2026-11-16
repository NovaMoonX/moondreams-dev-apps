import {
  collection,
  doc,
  documentId,
  getDocs,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { shiftDayKeyBy } from '@/utils/cadenceUtils';
import { HELM_COPY } from '@apps/helm/constants';
import {
  HABIT_LIFE,
  judgeHabitWeek,
  readOccurrences,
  readWeekKey,
  rejudgeHabit,
  type HabitStagePatch,
  type LifeDay,
  type LifeHabit,
} from '@apps/helm/engine/habitLife';
import { sealJson } from '@apps/helm/security';
import { markRemindersChanged } from '@apps/helm/store/actions/markRemindersChanged';
import type {
  Execution,
  ExecutionSealed,
  Habit,
  HabitHistoryEvent,
  HelmEncryption,
  OpenHabit,
} from '@apps/helm/types';

const WEEK_DAYS = 7;
const HISTORY_MAX = 30;

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);

/** A habit's last week is judged on the device only for a running habit that is not a carer's. */
export const isJudgeable = (habit: OpenHabit) =>
  !habit.isUnreadable && habit.status === 'active' && habit.forWhoId === null;

/** What on this open still needs the device: a week not yet judged, a late check-in waiting to re-judge, or a stage change the server made and nobody has been told. */
export const readJudgementWork = (habits: OpenHabit[], todayKey: string) => {
  const lastWeek = shiftDayKeyBy(readWeekKey(todayKey), -WEEK_DAYS);
  const isWeekly = (habit: OpenHabit) =>
    isJudgeable(habit) &&
    (habit.stageWeek === null || habit.stageWeek < lastWeek);
  return {
    lastWeek,
    due: habits.filter(
      (habit) => isWeekly(habit) || (isJudgeable(habit) && habit.rejudgeFrom),
    ),
    untold: habits.filter(
      (habit) => !habit.isUnreadable && habit.untoldSince !== null,
    ),
  };
};

export const toLifeDay = (data: Record<string, unknown>): LifeDay => {
  const entries = (data.entries ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  return {
    isInUse: data.isInUse === true,
    entries: Object.fromEntries(
      Object.entries(entries).map(([habitId, entry]) => [
        habitId,
        {
          checks: (entry.checks ?? {}) as LifeDay['entries'][string]['checks'],
          count: typeof entry.count === 'number' ? entry.count : 0,
          lastCountAt:
            typeof entry.lastCountAt === 'number' ? entry.lastCountAt : null,
          reminded: (entry.reminded ?? null) as Record<string, number> | null,
        },
      ]),
    ),
  };
};

/** The sixteen weeks the judgement reads, once. */
async function readJudgedDays(uid: string, lastWeek: string, todayKey: string) {
  const from = shiftDayKeyBy(
    lastWeek,
    -WEEK_DAYS * (HABIT_LIFE.judgedWeeks - 1),
  );
  const snapshot = await getDocs(
    query(
      collection(userOf(uid), 'habitDays'),
      where(documentId(), '>=', from),
      where(documentId(), '<=', todayKey),
    ),
  );
  return Object.fromEntries(
    snapshot.docs.map((entry) => [entry.id, toLifeDay(entry.data())]),
  );
}

const formatDay = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  }).format(at);

/** The stage change as Activity tells it, sealed, with no effects so Activity offers no Undo. */
async function toToldExecution(
  habit: Pick<OpenHabit, 'name' | 'privacy'>,
  stage: string,
  at: number,
  timeZone: string,
  encryption: HelmEncryption,
): Promise<Execution> {
  return {
    captureId: null,
    actor: 'nomos',
    via: null,
    category: 'organize',
    autonomyLevel: 1,
    state: 'succeeded',
    effectRefs: [],
    linkedWhoIds: [],
    linkedPlaceIds: [],
    undoesExecutionId: null,
    undoneByExecutionId: null,
    questionRef: null,
    errorCode: null,
    privacy: habit.privacy === 'private' ? 'private' : 'ordinary',
    createdAt: at,
    decidedAt: at,
    finishedAt: at,
    sealed: await sealJson<ExecutionSealed>(
      {
        summary: HELM_COPY.stageToldSummary(
          habit.name,
          HELM_COPY.stageTold(formatDay(at, timeZone), stage),
        ),
        said: null,
        commands: [],
        effects: [],
        undoReport: null,
        spoken: null,
        goneIds: null,
        lines: null,
        abilityOffer: null,
        awayZoneOffer: null,
      },
      encryption,
    ),
  };
}

const toLifeHabit = (open: OpenHabit, current: Habit): LifeHabit => ({
  ...open,
  stage: current.stage,
  stageAt: current.stageAt,
  stageWeek: current.stageWeek ?? null,
  rejudgeFrom: current.rejudgeFrom ?? null,
  formedAt: current.formedAt ?? null,
  history: current.history ?? [],
});

const toHistory = (
  history: HabitHistoryEvent[],
  event: HabitHistoryEvent | null,
) => (event ? [...history, event].slice(-HISTORY_MAX) : history);

/** Judges one habit in a transaction that writes only while its stored `stageWeek` is still older than the week (or its `rejudgeFrom` is still set), so two devices or the server land it once; a stage change is told in the same transaction, after the line for any stage the server changed that nobody was told, and `untoldSince` is cleared only when a line was written. */
async function judgeOne(
  uid: string,
  habit: OpenHabit,
  days: Record<string, LifeDay>,
  lastWeek: string,
  timeZone: string,
  encryption: HelmEncryption,
) {
  const ref = doc(collection(userOf(uid), 'habits'), habit.id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    const current = snapshot.data() as Habit;
    const life = toLifeHabit(habit, current);
    const patch: HabitStagePatch | null =
      life.stageWeek === null || life.stageWeek < lastWeek
        ? judgeHabitWeek(life, days, lastWeek, timeZone)
        : rejudgeHabit(life, days, timeZone);
    if (!patch) return;
    const isStoredUntold = current.untoldSince != null && !!current.stage;
    const isNewTold = patch.isStageChange && !!patch.stage;
    if (isStoredUntold && current.stage) {
      transaction.set(
        doc(collection(userOf(uid), 'executions')),
        await toToldExecution(
          habit,
          current.stage,
          current.stageAt,
          timeZone,
          encryption,
        ),
      );
    }
    transaction.update(ref, {
      stage: patch.stage,
      stageAt: patch.stageAt,
      stageWeek: patch.stageWeek,
      formedAt: patch.formedAt,
      ...(patch.isStageChange && patch.stage === 'formed'
        ? { formedKeptAt: null, formedKeptCount: 0 }
        : {}),
      rejudgeFrom: null,
      history: toHistory(life.history as HabitHistoryEvent[], patch.event),
      ...(isStoredUntold || isNewTold ? { untoldSince: null } : {}),
    });
    if (patch.isStageChange && current.reminder != null) {
      markRemindersChanged(transaction, uid, Date.now());
    }
    if (isNewTold && patch.stage) {
      transaction.set(
        doc(collection(userOf(uid), 'executions')),
        await toToldExecution(
          habit,
          patch.stage,
          patch.stageAt,
          timeZone,
          encryption,
        ),
      );
    }
  });
}

/** A stage change the server made is told on the next open: one execution dated the day it happened, and `untoldSince` cleared, in one transaction that checks it is still untold. */
async function tellOne(
  uid: string,
  habit: OpenHabit,
  timeZone: string,
  encryption: HelmEncryption,
) {
  const ref = doc(collection(userOf(uid), 'habits'), habit.id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists() ? (snapshot.data() as Habit) : null;
    if (!current || current.untoldSince == null || !current.stage) return;
    transaction.update(ref, { untoldSince: null });
    transaction.set(
      doc(collection(userOf(uid), 'executions')),
      await toToldExecution(
        habit,
        current.stage,
        current.stageAt,
        timeZone,
        encryption,
      ),
    );
  });
}

/** On an open: judges last week and any late check-ins for each running habit that needs it, then tells any change nobody has been told. One habit failing never stops the rest. */
export async function judgeHabitsOnOpen(
  uid: string,
  habits: OpenHabit[],
  todayKey: string,
  timeZone: string,
  encryption: HelmEncryption,
) {
  const work = readJudgementWork(habits, todayKey);
  if (work.due.length > 0) {
    const days = await readJudgedDays(uid, work.lastWeek, todayKey);
    await Promise.allSettled(
      work.due.map((habit) =>
        judgeOne(uid, habit, days, work.lastWeek, timeZone, encryption),
      ),
    );
  }
  await Promise.allSettled(
    work.untold.map((habit) => tellOne(uid, habit, timeZone, encryption)),
  );
}

const FORMED_SUMMARY_DAYS = 730;

/** What a formed habit leaves: its due times done and due since it started, from a one-shot read of at most two years of days, only at the moment it is let go. */
export async function readFormedSummary(
  uid: string,
  habit: OpenHabit,
  todayKey: string,
  timeZone: string,
): Promise<NonNullable<Habit['formedSummary']>> {
  const startKey = new Date(habit.startsOn).toISOString().slice(0, 10);
  const earliest = shiftDayKeyBy(todayKey, -FORMED_SUMMARY_DAYS);
  const from = startKey > earliest ? startKey : earliest;
  const snapshot = await getDocs(
    query(
      collection(userOf(uid), 'habitDays'),
      where(documentId(), '>=', from),
      where(documentId(), '<=', todayKey),
    ),
  );
  const days = Object.fromEntries(
    snapshot.docs.map((entry) => [entry.id, toLifeDay(entry.data())]),
  );
  const occurrences = readOccurrences(habit, days, from, todayKey, timeZone);
  return {
    doneCount: occurrences.filter((entry) => entry.isDone).length,
    dueCount: occurrences.length,
    since: habit.startsOn,
  };
}
