import { getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldPath,
  FieldValue,
  getFirestore,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import type { Keyring } from '../../../appKeys/keyring.js';
import type { SealedPayload } from '../../../appKeys/seal.js';
import { dayKeyToMs } from '../../../vendor/cadenceUtils.js';
import { HELM_MASTER_KEYS, loadHelmKeyring } from '../getHelmKey.js';
import { openForHelm, unwrapHelmKey, type HelmKey } from '../helmKey.js';
import { readWhoWhere } from '../nomos/planWhereabouts.js';
import { readZoneFor } from '../nomos/whereabouts.js';
import { readProfile } from '../reminders/readRecords.js';
import {
  dayAimsPath,
  dayQueuePath,
  openAimsView,
  sealAimsView,
} from './dayAimsStore.js';
import { makeFirstPlan } from './firstPlanStore.js';
import {
  findStaleSuggestions,
  isFirstPlanDue,
  isRollable,
  isWindDownDue,
  planOverlapFlags,
  planReplan,
  planRollover,
  readAimTaskIds,
  readDayClock,
  readPassLookAt,
  toDayKeyIn,
  type BusyEvent,
  type SlotRecord,
} from './dayJob.js';
import {
  readFinished,
  readSlots,
  toNumber,
  toPlannerTask,
  userPath,
} from './planRead.js';
import type { PlannerTask } from './planner.js';

if (getApps().length === 0) {
  initializeApp();
}

const MINUTE = 60_000;
const LEASE = 4 * MINUTE;
const RETRY_AFTER = 60 * MINUTE;
const PEOPLE_MAX = 100;
const AT_ONCE = 5;
const STOP_STARTING_AFTER = 180_000;
const EVENTS_READ = 200;
const EVENT_LOOKBEHIND = 12 * 60 * MINUTE;
const UNTIMED_EVENT = 30 * MINUTE;
const SPAN_MAX = 12 * 60 * MINUTE;
const DEFAULT_FILL = 50;

export interface DayReport {
  people: number;
  rolled: number;
  ready: number;
  firstPlans: number;
  flagged: number;
  replanned: number;
  failed: number;
  deferred: number;
}

/** The events that block the day, from the copies' readable fields alone: nothing of their words is opened. */
const readBusy = async (
  firestore: Firestore,
  uid: string,
  window: { startAt: number; endAt: number },
  busyAllDayRefs: string[],
): Promise<BusyEvent[]> => {
  const snap = await firestore
    .collection(`${userPath(uid)}/synced`)
    .where('kind', '==', 'event')
    .where('startAt', '>=', window.startAt - EVENT_LOOKBEHIND)
    .where('startAt', '<', window.endAt)
    .orderBy('startAt')
    .limit(EVENTS_READ)
    .get();
  return snap.docs.flatMap((doc): BusyEvent[] => {
    const data = doc.data();
    const startAt = toNumber(data.startAt);
    if (startAt === null || data.connectionEndedAt != null) return [];
    if (typeof data.helmRef === 'string') return [];
    const endAt = toNumber(data.endAt) ?? startAt + UNTIMED_EVENT;
    const isCalendar = data.connectorId === 'google:calendar';
    const isBusy = isCalendar
      ? data.isBusy !== false
      : endAt - startAt <= SPAN_MAX;
    if (!isBusy || endAt <= window.startAt) return [];
    if (data.isAllDay === true && !busyAllDayRefs.includes(doc.id)) return [];
    return data.isAllDay === true
      ? [{ ref: doc.id, startAt: window.startAt, endAt: window.endAt }]
      : [{ ref: doc.id, startAt, endAt }];
  });
};

const readTaskStatuses = async (
  firestore: Firestore,
  uid: string,
  taskIds: string[],
) => {
  if (taskIds.length === 0) return new Map<string, 'open' | 'done'>();
  const snaps = await firestore.getAll(
    ...taskIds.map((id) => firestore.doc(`${userPath(uid)}/tasks/${id}`)),
  );
  return new Map(
    snaps.flatMap((snap): [string, 'open' | 'done'][] =>
      snap.exists
        ? [[snap.id, snap.get('status') === 'done' ? 'done' : 'open']]
        : [],
    ),
  );
};

const readRollablePast = async (
  firestore: Firestore,
  uid: string,
  todayKey: string,
) => {
  const past = (
    await firestore
      .collection(`${userPath(uid)}/dayAims`)
      .where('date', '<', dayKeyToMs(todayKey))
      .orderBy('date', 'desc')
      .limit(1)
      .get()
  ).docs[0];
  return past &&
    isRollable(
      { dayKey: past.id, rolledAt: toNumber(past.get('rolledAt')) },
      todayKey,
    )
    ? past
    : null;
};

/** Carries yesterday's unfinished aims into today, once: the source day's `rolledAt` is written in the same transaction as today's aims. */
async function rollOver(
  firestore: Firestore,
  key: HelmKey,
  uid: string,
  todayKey: string,
  now: number,
): Promise<number> {
  const past = await readRollablePast(firestore, uid, todayKey);
  if (!past) return 0;
  const fromView = openAimsView(key, past.data());
  const statuses = await readTaskStatuses(
    firestore,
    uid,
    fromView.aims.map((aim) => aim.taskId),
  );
  const todayRef = firestore.doc(dayAimsPath(uid, todayKey));
  return firestore.runTransaction(async (transaction) => {
    const [pastSnap, todaySnap] = await Promise.all([
      transaction.get(past.ref),
      transaction.get(todayRef),
    ]);
    if (toNumber(pastSnap.get('rolledAt')) !== null) return 0;
    const today = openAimsView(key, todaySnap.data());
    const plan = planRollover({
      fromDayKey: past.id,
      from: fromView,
      taskStatus: statuses,
      today,
      newAimId: () => firestore.collection('_ids').doc().id,
    });
    transaction.update(past.ref, { rolledAt: now });
    if (plan.added === 0) return 0;
    const sealed = sealAimsView(key, {
      aims: plan.aims,
      windDown: today.windDown,
    });
    if (todaySnap.exists) transaction.update(todayRef, { sealed });
    else
      transaction.create(todayRef, {
        date: dayKeyToMs(todayKey),
        state: 'open',
        windDownState: 'waiting',
        lookAt: null,
        rolledAt: null,
        sealed,
      });
    return plan.added;
  });
}

/** The self's current away span ids, which decide whether a zone span still counts; null when there is no readable self, so every span counts. Read only when the person has zone spans. */
const readAwayIds = async (
  firestore: Firestore,
  key: HelmKey,
  uid: string,
  selfWhoId: unknown,
  isNeeded: boolean,
): Promise<string[] | null> => {
  if (!isNeeded || typeof selfWhoId !== 'string') return null;
  try {
    const snap = await firestore.doc(`${userPath(uid)}/who/${selfWhoId}`).get();
    return snap.exists
      ? readWhoWhere(
          openForHelm(key, snap.get('sealed') as SealedPayload),
        ).away.map((span) => span.id)
      : null;
  } catch {
    return null;
  }
};

async function runPerson(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  now: number,
  report: DayReport,
) {
  const queueRef = firestore.doc(dayQueuePath(uid));
  const lease = await firestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(queueRef);
    const until = toNumber(snap.get('leaseUntil'));
    if (until !== null && until > now) return null;
    transaction.set(queueRef, { leaseUntil: now + LEASE }, { merge: true });
    return { seen: toNumber(snap.get('changedAt')) };
  });
  if (lease === null) return;
  const { seen } = lease;
  const profileSnap = await firestore.doc(userPath(uid)).get();
  if (!profileSnap.exists) {
    await queueRef.delete();
    return;
  }
  const home = readProfile(profileSnap.data() as DocumentData);
  const key = await unwrapHelmKey(firestore, keyring, uid);
  const awayIds = await readAwayIds(
    firestore,
    key,
    uid,
    profileSnap.get('selfWhoId'),
    home.zoneSpans.length > 0,
  );
  const profile = {
    ...home,
    timeZone: readZoneFor(toDayKeyIn(now, home.timeZone), home, awayIds),
  };
  const fillPercent =
    toNumber(profileSnap.get('planFillPercent')) ?? DEFAULT_FILL;
  const busyAllDayRefs = Array.isArray(profileSnap.get('busyAllDayEventRefs'))
    ? (profileSnap.get('busyAllDayEventRefs') as unknown[]).filter(
        (ref): ref is string => typeof ref === 'string',
      )
    : [];
  const clock = readDayClock(now, profile);

  if (now >= clock.startAt)
    report.rolled += await rollOver(firestore, key, uid, clock.dayKey, now);

  const todayRef = firestore.doc(dayAimsPath(uid, clock.dayKey));
  const todaySnap = await todayRef.get();
  const view = openAimsView(key, todaySnap.data());
  const windDownState = String(todaySnap.get('windDownState') ?? 'waiting');
  if (
    todaySnap.exists &&
    isWindDownDue({ now, clock, windDownState, aimCount: view.aims.length })
  ) {
    const isSet = await firestore.runTransaction(async (transaction) => {
      const fresh = await transaction.get(todayRef);
      if (fresh.get('windDownState') !== 'waiting') return false;
      transaction.update(todayRef, { windDownState: 'ready' });
      return true;
    });
    if (isSet) report.ready += 1;
  }

  const planRef = firestore.doc(`${userPath(uid)}/planDays/${clock.dayKey}`);
  const firstSnap = await planRef.get();
  const aimTaskIds = readAimTaskIds(view);
  const isFirstDue = isFirstPlanDue({
    now,
    clock,
    hasPlan: toNumber(firstSnap.get('generatedAt')) !== null,
  });
  const isFirstMade =
    isFirstDue &&
    (await makeFirstPlan({
      firestore,
      key,
      uid,
      now,
      clock,
      profile,
      profileData: profileSnap.data() as DocumentData,
      fillPercent,
      aimTaskIds,
    }));
  if (isFirstMade) report.firstPlans += 1;
  const planSnap = isFirstMade ? await planRef.get() : firstSnap;
  const slots = readSlots(planSnap.data());
  const isPlanned = aimTaskIds.length > 0 && Object.keys(slots).length > 0;
  if (!isFirstMade && planSnap.exists && Object.keys(slots).length > 0) {
    const busy = await readBusy(
      firestore,
      uid,
      { startAt: clock.startAt, endAt: clock.endAt },
      busyAllDayRefs,
    );
    const flags = planOverlapFlags({
      slots,
      busy,
      aimTaskIds: new Set(aimTaskIds),
    });
    const replan =
      planSnap.get('isRestDay') === true
        ? { moved: {}, removed: {} }
        : await buildReplan({
            firestore,
            uid,
            now,
            clock,
            profile,
            fillPercent,
            slots,
            busy,
            aimTaskIds,
          });
    report.flagged += Object.keys(flags).length;
    report.replanned +=
      Object.keys(replan.moved).length + Object.keys(replan.removed).length;
    await firestore.runTransaction(async (transaction) => {
      const fresh = readSlots((await transaction.get(planRef)).data());
      Object.entries(flags).forEach(([slotId, ref]) => {
        const slot = fresh[slotId];
        if (slot?.status !== 'kept') return;
        transaction.update(
          planRef,
          new FieldPath('slots', slotId, 'overlapsEventRef'),
          ref,
        );
      });
      Object.entries(replan.moved).forEach(([slotId, next]) => {
        const slot = fresh[slotId];
        if (slot?.status !== 'suggested' || slot.startAt !== next.was) return;
        transaction.update(
          planRef,
          new FieldPath('slots', slotId, 'startAt'),
          next.startAt,
          new FieldPath('slots', slotId, 'endAt'),
          next.endAt,
        );
      });
      Object.entries(replan.removed).forEach(([slotId, was]) => {
        const slot = fresh[slotId];
        if (slot?.status !== 'suggested' || slot.startAt !== was) return;
        transaction.update(
          planRef,
          new FieldPath('slots', slotId),
          FieldValue.delete(),
        );
      });
    });
  }

  const isRolloverOwed =
    now < clock.startAt &&
    (await readRollablePast(firestore, uid, clock.dayKey)) !== null;
  const lookAt = readPassLookAt({
    now,
    clock,
    windDownState,
    aimCount: view.aims.length,
    isPlanned,
    isRolloverOwed,
    isFirstPlanOwed: isFirstDue && !isFirstMade,
  });
  await firestore.runTransaction(async (transaction) => {
    const queue = await transaction.get(queueRef);
    const isChanged = toNumber(queue.get('changedAt')) !== seen;
    transaction.set(
      queueRef,
      {
        lookAt: isChanged ? now : lookAt,
        plannedAt: now,
        leaseUntil: null,
      },
      { merge: true },
    );
  });
}

async function buildReplan(input: {
  firestore: Firestore;
  uid: string;
  now: number;
  clock: ReturnType<typeof readDayClock>;
  profile: ReturnType<typeof readProfile>;
  fillPercent: number;
  slots: Record<string, SlotRecord>;
  busy: BusyEvent[];
  aimTaskIds: string[];
}) {
  const { firestore, uid, clock, profile, slots, busy } = input;
  const staleTaskIds = [
    ...new Set(
      Object.values(slots).flatMap((slot) =>
        slot.status === 'suggested' ? [slot.taskId] : [],
      ),
    ),
  ];
  if (findStaleSuggestions(slots, busy).length === 0)
    return { moved: {}, removed: {} };
  const snaps = await firestore.getAll(
    ...staleTaskIds.map((id) => firestore.doc(`${userPath(uid)}/tasks/${id}`)),
  );
  const tasks = snaps.flatMap((snap): PlannerTask[] =>
    snap.exists && snap.get('status') !== 'done'
      ? [toPlannerTask(snap.id, snap.data() as DocumentData)]
      : [],
  );
  const finishedTasks = tasks.some((task) => task.durationMinutes === null)
    ? await readFinished(firestore, uid)
    : [];
  return planReplan({
    dayKey: clock.dayKey,
    timeZone: profile.timeZone,
    now: input.now,
    dayStartTime: profile.dayStartTime,
    dayEndTime: profile.dayEndTime,
    fillPercent: input.fillPercent,
    busy: busy.map((event) => ({ ...event, title: '' })),
    slots,
    tasks,
    aimTaskIds: input.aimTaskIds,
    finishedTasks,
  });
}

const readPeople = async (firestore: Firestore, now: number) => {
  const due = await firestore
    .collection('apps/helm/dayQueue')
    .where('lookAt', '<=', now)
    .limit(PEOPLE_MAX)
    .get();
  return due.docs.map((doc) => doc.id);
};

const runGroups = async (
  firestore: Firestore,
  keyring: Keyring,
  groups: string[][],
  now: number,
  startedAt: number,
  report: DayReport,
): Promise<DayReport> => {
  if (groups.length === 0) return report;
  if (Date.now() - startedAt > STOP_STARTING_AFTER) {
    report.deferred += groups.flat().length;
    return report;
  }
  await Promise.all(
    groups[0].map((uid) =>
      runPerson(firestore, keyring, uid, now, report).catch(
        async (error: unknown) => {
          report.failed += 1;
          logger.error('helm.dayPlan.runFailed', {
            who: uid.slice(0, 4),
            name: error instanceof Error ? error.name : 'error',
          });
          await firestore
            .doc(dayQueuePath(uid))
            .set(
              { leaseUntil: null, lookAt: now + RETRY_AFTER },
              { merge: true },
            )
            .catch(() => undefined);
        },
      ),
    ),
  );
  return runGroups(firestore, keyring, groups.slice(1), now, startedAt, report);
};

/** Runs every day that has come due for everyone, and never sends a push. */
export async function runDayPlans(
  firestore: Firestore,
  keyring: Keyring,
  now: number,
): Promise<DayReport> {
  const people = await readPeople(firestore, now);
  const groups = Array.from(
    { length: Math.ceil(people.length / AT_ONCE) },
    (_, index) => people.slice(index * AT_ONCE, (index + 1) * AT_ONCE),
  );
  return runGroups(firestore, keyring, groups, now, Date.now(), {
    people: people.length,
    rolled: 0,
    ready: 0,
    firstPlans: 0,
    flagged: 0,
    replanned: 0,
    failed: 0,
    deferred: 0,
  });
}

export const runHelmDayPlan = onSchedule(
  {
    schedule: '*/15 * * * *',
    timeoutSeconds: 240,
    secrets: [HELM_MASTER_KEYS],
  },
  async () => {
    const report = await runDayPlans(
      getFirestore(),
      loadHelmKeyring(),
      Date.now(),
    );
    logger.info('helm.dayPlan.ran', report);
  },
);

export default runHelmDayPlan;
