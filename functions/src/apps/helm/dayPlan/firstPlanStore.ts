import {
  FieldValue,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

import type { SealedPayload } from '../../../appKeys/seal.js';
import { readGrant } from '../../../connections/grants.js';
import { dayKeyToMs } from '../../../vendor/cadenceUtils.js';
import { openForHelm, sealForHelm, type HelmKey } from '../helmKey.js';
import { readImportanceRecords } from '../importanceStore.js';
import {
  readImportanceOrder,
  readProjectPlaces,
} from '../nomos/importanceOrder.js';
import type { DayClock } from './dayJob.js';
import {
  buildFirstPlan,
  filterAwake,
  isCalendarHeld,
  OPEN_TASKS_LIMIT,
  readAvoidBuckets,
  type GrantEntry,
  type PlanEvent,
  type TaskRow,
} from './firstPlan.js';
import { planDay } from './planner.js';
import { readFinished, readSlots, toNumber, userPath } from './planRead.js';

const DAY_MS = 86_400_000;
const EVENTS_READ = 400;
const EVENT_LOOKBEHIND_DAYS = 14;
const PLAN_DAYS_READ = 30;
const PATTERNS_READ = 500;
const SUMMARY_DAY = 'today';

const readGrants = async (
  firestore: Firestore,
  uid: string,
): Promise<GrantEntry[]> =>
  (
    await firestore
      .collection(`connections/${uid}/grants`)
      .where('readerAppId', '==', 'helm')
      .get()
  ).docs.map((doc) => ({ id: doc.id, grant: readGrant(doc.data()) }));

const readEvents = async (
  firestore: Firestore,
  uid: string,
  key: HelmKey,
  day: number,
): Promise<PlanEvent[]> => {
  const noon = day + DAY_MS / 2;
  const snap = await firestore
    .collection(`${userPath(uid)}/synced`)
    .where('kind', '==', 'event')
    .where('startAt', '>=', noon - EVENT_LOOKBEHIND_DAYS * DAY_MS)
    .where('startAt', '<=', noon + 2 * DAY_MS)
    .orderBy('startAt', 'desc')
    .limit(EVENTS_READ)
    .get();
  return snap.docs.flatMap((doc): PlanEvent[] => {
    const data = doc.data();
    if (data.connectionEndedAt != null || typeof data.helmRef === 'string')
      return [];
    const words = openWords(key, data.sealed);
    if (typeof words?.title !== 'string') return [];
    const extra = words?.extra as { sameEventKey?: unknown } | undefined;
    return [
      {
        id: doc.id,
        grantId: typeof data.grantId === 'string' ? data.grantId : '',
        connectorId:
          typeof data.connectorId === 'string' ? data.connectorId : '',
        category: typeof data.category === 'string' ? data.category : '',
        startAt: toNumber(data.startAt),
        endAt: toNumber(data.endAt),
        isAllDay: data.isAllDay === true,
        isBusy: typeof data.isBusy === 'boolean' ? data.isBusy : null,
        calendarKey:
          typeof data.calendarKey === 'string' ? data.calendarKey : null,
        title: words.title,
        sameEventKey:
          typeof extra?.sameEventKey === 'string' ? extra.sameEventKey : null,
      },
    ];
  });
};

const openWords = (key: HelmKey, sealed: unknown) => {
  try {
    return sealed ? openForHelm(key, sealed as SealedPayload) : null;
  } catch {
    return null;
  }
};

const readTasks = async (
  firestore: Firestore,
  uid: string,
  key: HelmKey,
): Promise<TaskRow[]> =>
  (
    await firestore
      .collection(`${userPath(uid)}/tasks`)
      .where('status', '==', 'open')
      .orderBy('createdAt', 'desc')
      .limit(OPEN_TASKS_LIMIT)
      .get()
  ).docs.map((doc) => {
    const words = openWords(key, doc.get('sealed'));
    return {
      id: doc.id,
      data: doc.data(),
      isCare: words?.privateMark === 'care',
      isUnreadable: words === null,
    };
  });

const readPatterns = async (firestore: Firestore, uid: string, key: HelmKey) =>
  (
    await firestore
      .collection(`${userPath(uid)}/patterns`)
      .where('isLive', '==', true)
      .limit(PATTERNS_READ)
      .get()
  ).docs.flatMap((doc) =>
    openWords(key, doc.get('sealed')) === null
      ? []
      : [
          {
            state: String(doc.get('state')),
            effect: doc.get('effect') as unknown,
            createdAt: toNumber(doc.get('createdAt')) ?? 0,
          },
        ],
  );

const readLaterKeptTaskIds = async (
  firestore: Firestore,
  uid: string,
  day: number,
) =>
  (
    await firestore
      .collection(`${userPath(uid)}/planDays`)
      .where('date', '>', day)
      .limit(PLAN_DAYS_READ)
      .get()
  ).docs.flatMap((doc) =>
    Object.values(readSlots(doc.data())).flatMap((slot) =>
      slot.status === 'kept' ? [slot.taskId] : [],
    ),
  );

/** The day's first plan, made on the server before the person opens the app, written as the device writes it: slots keyed by task id, the reasons and calendar snapshot sealed, and one proposed execution when anything is suggested. Says whether a plan was made, the calendar is held back, or a plan arrived while this one was worked out. */
export async function makeFirstPlan(input: {
  firestore: Firestore;
  key: HelmKey;
  uid: string;
  now: number;
  clock: DayClock;
  profile: {
    timeZone: string;
    dayStartTime: string;
    dayEndTime: string;
  };
  profileData: DocumentData;
  fillPercent: number;
  aimTaskIds: string[];
}): Promise<'made' | 'held' | 'raced'> {
  const { firestore, key, uid, now, clock, profile } = input;
  const grants = await readGrants(firestore, uid);
  if (isCalendarHeld(grants.map((entry) => entry.grant))) return 'held';
  const day = dayKeyToMs(clock.dayKey);
  const isLearningOn = input.profileData.isLearningOn !== false;
  const base = userPath(uid);
  const [
    events,
    openTasks,
    laterKeptTaskIds,
    finishedTasks,
    records,
    patterns,
  ] = await Promise.all([
    readEvents(firestore, uid, key, day),
    readTasks(firestore, uid, key),
    readLaterKeptTaskIds(firestore, uid, day),
    readFinished(firestore, uid),
    readImportanceRecords(firestore, base, key, now, profile.timeZone),
    isLearningOn ? readPatterns(firestore, uid, key) : [],
  ]);
  const strings = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  const sources = {
    dayKey: clock.dayKey,
    timeZone: profile.timeZone,
    now,
    dayStartAt: clock.startAt,
    dayEndAt: clock.endAt,
    dayStartTime: profile.dayStartTime,
    dayEndTime: profile.dayEndTime,
    fillPercent: input.fillPercent,
    shiftCalendarIds: strings(input.profileData.shiftCalendarIds),
    busyAllDayEventRefs: strings(input.profileData.busyAllDayEventRefs),
    grants,
    events,
    tasks: filterAwake(openTasks, day),
    projectPlaces: readProjectPlaces(
      readImportanceOrder(
        records.map((record) => record.item),
        day,
      ),
    ),
    avoidBuckets: readAvoidBuckets(patterns, {
      isLearningOn,
      forgottenAt: toNumber(input.profileData.forgottenAt),
    }),
    aimTaskIds: input.aimTaskIds,
    finishedTasks,
    laterKeptTaskIds,
  };
  const planRef = firestore.doc(`${base}/planDays/${clock.dayKey}`);
  const executionRef = firestore.doc(`${base}/executions/plan-${clock.dayKey}`);
  return firestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(planRef);
    if (toNumber(snap.get('generatedAt')) !== null) return 'raced';
    const overriddenAt = toNumber(snap.get('restDayOverriddenAt'));
    const built = buildFirstPlan(
      { ...sources, restDayOverriddenAt: overriddenAt },
      readSlots(snap.data()),
    );
    const result = planDay(built.input, (taskId) => taskId);
    const removed = Object.keys(built.input.slots).filter(
      (id) => !(id in result.slots),
    );
    const before = openWords(key, snap.get('sealed'));
    const earlier =
      before?.reasons && typeof before.reasons === 'object'
        ? (before.reasons as Record<string, string>)
        : {};
    const reasons = Object.fromEntries(
      Object.entries({ ...earlier, ...result.reasons }).filter(
        ([id]) => id in result.slots,
      ),
    );
    const suggested = Object.values(result.slots).filter(
      (slot) => slot.status === 'suggested',
    ).length;
    transaction.set(
      planRef,
      {
        date: day,
        slots: {
          ...result.slots,
          ...Object.fromEntries(removed.map((id) => [id, FieldValue.delete()])),
        },
        isRestDay: built.input.restDay !== null || overriddenAt !== null,
        restDayOverriddenAt: overriddenAt,
        generatedAt: now,
        calendarReadAt: built.calendarReadAt,
        sealed: sealForHelm(key, {
          reasons,
          calendarSnapshot: built.calendarSnapshot,
        }),
      },
      { merge: true },
    );
    if (suggested > 0) {
      transaction.set(executionRef, {
        captureId: null,
        actor: 'nomos',
        via: null,
        category: 'plan',
        autonomyLevel: 1,
        state: 'proposed',
        effectRefs: [],
        linkedWhoIds: [],
        linkedPlaceIds: [],
        undoesExecutionId: null,
        undoneByExecutionId: null,
        undoneDocIds: null,
        partUndoIds: null,
        questionRef: null,
        errorCode: null,
        privacy: 'ordinary',
        createdAt: now,
        decidedAt: null,
        finishedAt: null,
        sealed: sealForHelm(key, {
          summary: `Suggested ${suggested} ${suggested === 1 ? 'task' : 'tasks'} for ${SUMMARY_DAY}`,
          commands: [],
          effects: [],
          undoReport: null,
          spoken: null,
          goneIds: null,
          undoReason: null,
          said: null,
          lines: null,
          abilityOffer: null,
          awayZoneOffer: null,
        }),
      });
    }
    return 'made';
  });
}
