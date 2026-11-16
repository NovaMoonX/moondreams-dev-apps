import type {
  DocumentData,
  Firestore,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';

import { zonedDateTimeToEpoch } from '../../../notifications/zonedTime.js';
import { readGrant } from '../../../connections/grants.js';
import { dayKeyToMs, shiftDayKeyBy } from '../../../vendor/cadenceUtils.js';
import { openForHelm, type HelmKey } from '../helmKey.js';
import { activeQuery, openProjects } from '../projectStore.js';
import {
  getLocalDay,
  readSyncedEvents,
  toKnownZone,
  type SyncedCopy,
} from '../syncedCopies.js';
import type { CaptureReading, TaskDue } from './commands.js';
import {
  readFreeMinutes,
  readTripFit,
  type FitTask,
  type FitThing,
  type FreeDay,
  type TripFit,
} from './freeTime.js';
import { readWhoWhere, tripsFromCopies } from './planWhereabouts.js';

export interface FitRange {
  firstDay: string;
  lastDay: string;
}

export interface ContextFit extends FitRange {
  fit: TripFit;
  events: SyncedCopy[];
}

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 14;
const LOOK_AHEAD_DAYS = 14;
const MAX_EVENT_DAYS = 30;
const MAX_FIT_EVENTS = 200;
const LONGEST_BUSY_MS = 12 * 3_600_000;
const UNTIMED_BUSY_MS = 3_600_000;
const FILL_PERCENT = 50;

const FIT_CUE_RE =
  /\b(before (i|we) (go|leave|head out)|leav(e|ing)|hit(ting)? the road|go(ing)? away|away|trip|get done|what'?s left|(can|could) (i|we) go)\b/i;

const isFitTurn = (input: {
  text: string;
  answeredQuestion: string | null;
  isQuestion: boolean;
}) =>
  input.isQuestion &&
  (FIT_CUE_RE.test(input.text) ||
    FIT_CUE_RE.test(input.answeredQuestion ?? ''));

const toDayKey = (at: number) => new Date(at).toISOString().slice(0, 10);

/** The days a can-I-go question is about: the days it names, widened to the away span or trip they start; with no day named, the nearest one starting within two weeks. */
export function readFitRange(input: {
  text: string;
  answeredQuestion: string | null;
  dates: CaptureReading['dates'];
  away: { from: number; to: number }[];
  todayKey: string;
  timeZone: string;
  isQuestion: boolean;
}): FitRange | null {
  if (!isFitTurn(input)) return null;
  const keys = input.dates
    .filter((span) => span.precision === null)
    .map((span) =>
      span.due.kind === 'day'
        ? toDayKey(span.due.date)
        : toDayKey(getLocalDay(span.due.at, toKnownZone(input.timeZone))),
    )
    .sort();
  const spans = [...input.away].sort((a, b) => a.from - b.from);
  const withEnd = (firstDay: string) => {
    const near = spans.find(
      (span) => Math.abs(span.from - dayKeyToMs(firstDay)) <= DAY_MS,
    );
    return near && toDayKey(near.to) > firstDay
      ? { firstDay, lastDay: toDayKey(near.to) }
      : { firstDay, lastDay: firstDay };
  };
  const found = ((): FitRange | null => {
    if (keys.length >= 2) {
      return { firstDay: keys[0], lastDay: keys[keys.length - 1] };
    }
    if (keys.length === 1) return withEnd(keys[0]);
    const next = spans.find(
      (span) =>
        toDayKey(span.from) >= input.todayKey &&
        toDayKey(span.from) <= shiftDayKeyBy(input.todayKey, LOOK_AHEAD_DAYS),
    );
    return next
      ? { firstDay: toDayKey(next.from), lastDay: toDayKey(next.to) }
      : null;
  })();
  if (!found) return null;
  const firstDay =
    found.firstDay < input.todayKey ? input.todayKey : found.firstDay;
  const lastDay = [
    found.lastDay < firstDay ? firstDay : found.lastDay,
    shiftDayKeyBy(firstDay, MAX_RANGE_DAYS - 1),
  ].sort()[0];
  return { firstDay, lastDay };
}

const isBusy = (copy: SyncedCopy) => {
  const startAt = copy.startAt ?? 0;
  const endAt = copy.endAt ?? startAt + UNTIMED_BUSY_MS;
  return (
    copy.kind === 'event' &&
    !copy.isAllDay &&
    copy.startAt !== null &&
    endAt - startAt <= LONGEST_BUSY_MS &&
    copy.extra.isFree !== true
  );
};

const toDueDay = (due: TaskDue | null, timeZone: string) => {
  if (!due) return null;
  return due.kind === 'day' ? due.date : getLocalDay(due.at, timeZone);
};

const toClock = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : fallback;

const hasLiveCalendar = async (firestore: Firestore, uid: string) =>
  (
    await firestore
      .collection(`connections/${uid}/grants`)
      .where('readerAppId', '==', 'helm')
      .get()
  ).docs
    .map((doc) => readGrant(doc.data()))
    .some(
      (grant) =>
        grant.connectorId === 'google:calendar' &&
        grant.status === 'live' &&
        Object.values(grant.categories).some((category) => category.isOn),
    );

const readAway = async (
  firestore: Firestore,
  base: string,
  key: HelmKey,
  selfWhoId: string | null,
) => {
  if (!selfWhoId) return [];
  try {
    const snapshot = await firestore.doc(`${base}/who/${selfWhoId}`).get();
    return snapshot.exists
      ? readWhoWhere(
          openForHelm(key, snapshot.get('sealed')) as Record<string, unknown>,
        ).away
      : [];
  } catch {
    return [];
  }
};

/** What a stretch away asks of the days before it, worked out from the person's records for a can-I-go question; null when the turn is not that or names no days. Timed events block time; apps' events are read only when `isAppsHeld` is false. */
export async function readContextFit(input: {
  firestore: Firestore;
  uid: string;
  base: string;
  key: HelmKey;
  profile: DocumentData | undefined;
  taskDocs: QueryDocumentSnapshot[];
  selfWhoId: string | null;
  trips: ReturnType<typeof tripsFromCopies>;
  text: string;
  answeredQuestion: string | null;
  dates: CaptureReading['dates'];
  isQuestion: boolean;
  isAppsHeld: boolean;
  now: number;
  timeZone: string;
}): Promise<ContextFit | null> {
  const zone = toKnownZone(input.timeZone);
  const today = getLocalDay(input.now, zone);
  const todayKey = toDayKey(today);
  if (!isFitTurn(input)) return null;
  const away = [
    ...(await readAway(
      input.firestore,
      input.base,
      input.key,
      input.selfWhoId,
    )),
    ...input.trips,
  ];
  const range = readFitRange({
    text: input.text,
    answeredQuestion: input.answeredQuestion,
    dates: input.dates,
    away,
    todayKey,
    timeZone: zone,
    isQuestion: input.isQuestion,
  });
  if (!range) return null;
  const lastRead = Math.round((dayKeyToMs(range.lastDay) - today) / DAY_MS);
  const days = Math.min(MAX_EVENT_DAYS, lastRead + 1 + LOOK_AHEAD_DAYS);
  const [events, hasCalendar, projectDocs] = await Promise.all([
    input.isAppsHeld
      ? Promise.resolve([] as SyncedCopy[])
      : readSyncedEvents(input.firestore, input.uid, input.key, {
          firstDay: today,
          days,
          timeZone: zone,
          limit: MAX_FIT_EVENTS,
        }),
    input.isAppsHeld
      ? Promise.resolve(false)
      : hasLiveCalendar(input.firestore, input.uid),
    activeQuery(input.firestore, input.base).get(),
  ]);
  const lastReadKey = shiftDayKeyBy(todayKey, days - 1);
  const profile = input.profile ?? {};
  const dayStartTime = toClock(profile.dayStartTime, '08:00');
  const dayEndTime = toClock(profile.dayEndTime, '22:00');
  const fillPercent =
    typeof profile.planFillPercent === 'number'
      ? profile.planFillPercent
      : FILL_PERCENT;
  const busy = events.filter(isBusy).map((copy) => ({
    startAt: copy.startAt as number,
    endAt: copy.endAt ?? (copy.startAt as number) + UNTIMED_BUSY_MS,
  }));
  const freeDay = (dayKey: string): FreeDay => {
    const dayStart = zonedDateTimeToEpoch(dayKey, '00:00', zone);
    const dayEnd = zonedDateTimeToEpoch(
      shiftDayKeyBy(dayKey, 1),
      '00:00',
      zone,
    );
    const isRead = hasCalendar && dayKey <= lastReadKey;
    return {
      minutes: readFreeMinutes({
        dayKey,
        timeZone: zone,
        now: input.now,
        dayStartTime,
        dayEndTime,
        fillPercent,
        restDay: null,
        busy: isRead
          ? busy.filter(
              (block) => block.startAt < dayEnd && block.endAt > dayStart,
            )
          : [],
      }),
      busyShare: 0,
      hasCalendar: isRead,
    };
  };
  const things = openProjects(input.key, projectDocs.docs).map(
    (project): FitThing => ({
      id: project.id,
      name: project.name,
      kind: project.kind,
      status: project.isPaused ? 'paused' : 'running',
      isCare: false,
      dates: [
        ...(project.targetDate === null ? [] : [project.targetDate]),
        ...Object.values(project.milestoneState).flatMap((state) =>
          state.doneAt === null && state.date !== null ? [state.date] : [],
        ),
      ],
    }),
  );
  const tasks = input.taskDocs.map((doc): FitTask => ({
    id: doc.id,
    projectId:
      typeof doc.get('projectId') === 'string' ? doc.get('projectId') : null,
    dueDay: toDueDay(doc.get('due') ?? null, zone),
    minutes:
      typeof doc.get('durationMinutes') === 'number'
        ? doc.get('durationMinutes')
        : null,
    isLatent:
      typeof doc.get('notUntil') === 'number' &&
      doc.get('notUntil') > input.now,
  }));
  const dayKeyOf = (copy: SyncedCopy) =>
    toDayKey(
      copy.isAllDay
        ? (copy.startAt as number)
        : getLocalDay(copy.startAt as number, zone),
    );
  const inRange = events.filter(
    (copy) =>
      copy.startAt !== null &&
      dayKeyOf(copy) >= range.firstDay &&
      dayKeyOf(copy) <= range.lastDay,
  );
  const fit = readTripFit({
    todayKey,
    things,
    tasks,
    freeDay,
    range,
    events: inRange.map((copy) => ({ id: copy.id, dayKey: dayKeyOf(copy) })),
  });
  return { ...range, fit, events: inRange };
}
