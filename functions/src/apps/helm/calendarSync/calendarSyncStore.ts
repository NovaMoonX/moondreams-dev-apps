import { createHash, hkdfSync } from 'node:crypto';

import { logger } from 'firebase-functions';

import {
  FieldPath,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

import type { SealedPayload } from '../../../appKeys/seal.js';
import { toGrantId } from '../../../vendor/connectionsContract.js';
import { toSyncedId } from '../connections/sink.js';
import { isPrivateHabit, openLiveHabit } from '../habitStore.js';
import { openForHelm, sealForHelm, type HelmKey } from '../helmKey.js';
import { AUTOMATIC_LEVEL } from '../nomos/policy.js';
import { isPrivateInEffect } from '../privacy.js';
import {
  toWindow,
  type EventLink,
  type HabitInput,
  type ReadBackChange,
  type RemoteEvent,
  type SlotInput,
  type TaskInput,
} from './plan.js';

export const CALENDAR_ID_SCOPE_EVENTS =
  'https://www.googleapis.com/auth/calendar.events';
export const CALENDAR_ID_SCOPE_APP_CREATED =
  'https://www.googleapis.com/auth/calendar.app.created';
export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

const LINK_HASH_INFO = 'helm-calendar-link';
const TASKS_READ = 400;
const HABITS_READ = 200;
const LINKS_READ = 1000;
const READ_CHUNK = 300;

export const userPath = (uid: string) => `apps/helm/users/${uid}`;
export const leasePath = (uid: string) =>
  `apps/helm/server/${uid}/calendarSync/lease`;
export const toCalendarGrantId = (accountId: string) =>
  toGrantId('helm', 'google:calendar', accountId);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const toLinkSubkey = (key: HelmKey) =>
  Buffer.from(hkdfSync('sha256', key.key, Buffer.alloc(0), LINK_HASH_INFO, 32));

const toLinkId = (ref: string) =>
  createHash('sha256').update(ref).digest('hex').slice(0, 40);

const chunk = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

export const takeLease = (
  firestore: Firestore,
  uid: string,
  now: number,
  ms: number,
) =>
  firestore.runTransaction(async (transaction) => {
    const ref = firestore.doc(leasePath(uid));
    const until = toNumber((await transaction.get(ref)).data()?.leaseUntil);
    if (until !== null && until > now) return false;
    transaction.set(ref, { leaseUntil: now + ms });
    return true;
  });

export const releaseLease = (firestore: Firestore, uid: string) =>
  firestore
    .doc(leasePath(uid))
    .set({ leaseUntil: null })
    .catch(() => undefined);

export const readLinks = async (firestore: Firestore, uid: string) => {
  const snapshot = await firestore
    .collection(`${userPath(uid)}/calendarLinks`)
    .limit(LINKS_READ)
    .get();
  return new Map(
    snapshot.docs.flatMap((doc): [string, EventLink][] => {
      const data = doc.data();
      return typeof data.helmRef === 'string' &&
        typeof data.eventId === 'string' &&
        typeof data.calendarId === 'string' &&
        toNumber(data.startAt) !== null &&
        toNumber(data.endAt) !== null &&
        typeof data.contentHash === 'string' &&
        toNumber(data.writtenAt) !== null
        ? [
            [
              data.helmRef,
              {
                helmRef: data.helmRef,
                eventId: data.eventId,
                calendarId: data.calendarId,
                startAt: data.startAt as number,
                endAt: data.endAt as number,
                contentHash: data.contentHash,
                writtenAt: data.writtenAt as number,
                removedAt: toNumber(data.removedAt),
              },
            ],
          ]
        : [];
    }),
  );
};

export const writeLink = (firestore: Firestore, uid: string, link: EventLink) =>
  firestore
    .doc(`${userPath(uid)}/calendarLinks/${toLinkId(link.helmRef)}`)
    .set(link);

export const deleteLink = (firestore: Firestore, uid: string, ref: string) =>
  firestore.doc(`${userPath(uid)}/calendarLinks/${toLinkId(ref)}`).delete();

export const readRemote = async (
  firestore: Firestore,
  uid: string,
  grantId: string,
  links: Map<string, EventLink>,
) => {
  const live = [...links.values()].filter((link) => link.removedAt === null);
  const refs = live.map((link) =>
    firestore.doc(
      `${userPath(uid)}/synced/${toSyncedId(grantId, 'events', `${link.calendarId}|${link.eventId}`)}`,
    ),
  );
  const snaps = (
    await Promise.all(
      chunk(refs, READ_CHUNK).map((group) => firestore.getAll(...group)),
    )
  ).flat();
  return new Map(
    snaps.flatMap((snap, at): [string, RemoteEvent][] =>
      snap.exists && snap.get('connectionEndedAt') === null
        ? [
            [
              live[at].helmRef,
              {
                startAt: toNumber(snap.get('startAt')),
                endAt: toNumber(snap.get('endAt')),
                sourceUpdatedAt: toNumber(snap.get('sourceUpdatedAt')),
                isAllDay: snap.get('isAllDay') === true,
              },
            ],
          ]
        : [],
    ),
  );
};

export interface CalendarGrantState {
  isLive: boolean;
  isEventsOn: boolean;
  calendarIds: string[];
  readThrough: number | null;
}

export const readGrantState = async (
  firestore: Firestore,
  uid: string,
  accountId: string,
): Promise<CalendarGrantState | null> => {
  const snap = await firestore
    .doc(`connections/${uid}/grants/${toCalendarGrantId(accountId)}`)
    .get();
  if (!snap.exists) return null;
  const options: unknown = snap.get('options');
  const ids =
    isRecord(options) && Array.isArray(options.calendarIds)
      ? options.calendarIds.filter((id): id is string => typeof id === 'string')
      : [];
  return {
    isLive: snap.get('status') === 'live',
    isEventsOn: snap.get('categories.events.isOn') === true,
    calendarIds: ids,
    readThrough: toNumber(snap.get('categoryState.events.lastOkAt')),
  };
};

const openTitle = (key: HelmKey, data: DocumentData) => {
  try {
    const words = openForHelm(key, data.sealed as SealedPayload);
    return typeof words.title === 'string'
      ? {
          title: words.title,
          isMarked: isPrivateInEffect({
            privateMark:
              words.privateMark === 'health' ||
              words.privateMark === 'care' ||
              words.privateMark === 'person'
                ? words.privateMark
                : null,
            isPrivacyCleared: words.isPrivacyCleared === true,
          }),
        }
      : null;
  } catch {
    return null;
  }
};

const toTask = (
  key: HelmKey,
  id: string,
  data: DocumentData,
): TaskInput | null => {
  const opened = openTitle(key, data);
  if (!opened) return null;
  const due: unknown = data.due;
  return {
    id,
    title: opened.title,
    isPrivate: data.privacy === 'private' || opened.isMarked,
    status: data.status === 'done' ? 'done' : 'open',
    dueAt: isRecord(due) && due.kind === 'moment' ? toNumber(due.at) : null,
    durationMinutes: toNumber(data.durationMinutes),
    hasMeets: isRecord(data.meets),
    lastEditedAt: toNumber(data.lastEditedAt),
  };
};

export interface SyncInputs {
  slots: SlotInput[];
  tasks: TaskInput[];
  habits: HabitInput[];
}

export const readSyncInputs = async (
  firestore: Firestore,
  uid: string,
  key: HelmKey,
  now: number,
  timeZone: string,
): Promise<SyncInputs> => {
  const base = userPath(uid);
  const { dayKeys, startAt, endAt } = toWindow(now, timeZone);
  const [days, meetSnap, habitSnap] = await Promise.all([
    firestore.getAll(
      ...dayKeys.map((dayKey) => firestore.doc(`${base}/planDays/${dayKey}`)),
    ),
    firestore
      .collection(`${base}/tasks`)
      .where('status', '==', 'open')
      .where('due.kind', '==', 'moment')
      .where('due.at', '>=', startAt)
      .where('due.at', '<', endAt)
      .orderBy('due.at')
      .limit(TASKS_READ)
      .get(),
    firestore
      .collection(`${base}/habits`)
      .where('status', 'in', ['active', 'paused'])
      .limit(HABITS_READ)
      .get(),
  ]);
  if (meetSnap.size >= TASKS_READ) logger.warn('helm.calendarSync.tasksLimit');
  const slots = days.flatMap((day) => {
    const raw: unknown = day.get('slots');
    return day.exists && isRecord(raw)
      ? Object.entries(raw).flatMap(([slotId, slot]): SlotInput[] =>
          isRecord(slot) && typeof slot.taskId === 'string'
            ? [
                {
                  dayKey: day.id,
                  slotId,
                  taskId: slot.taskId,
                  startAt: toNumber(slot.startAt),
                  endAt: toNumber(slot.endAt),
                  status: typeof slot.status === 'string' ? slot.status : '',
                  decidedAt: toNumber(slot.decidedAt),
                },
              ]
            : [],
        )
      : [];
  });
  const slotTaskIds = Array.from(
    new Set(
      slots.filter((slot) => slot.status === 'kept').map((slot) => slot.taskId),
    ),
  );
  const meetDocs = meetSnap.docs.filter((doc) => {
    const at = toNumber(doc.get('due.at'));
    return (
      isRecord(doc.get('meets')) && at !== null && at >= startAt && at < endAt
    );
  });
  const extra = slotTaskIds.filter(
    (id) => !meetDocs.some((doc) => doc.id === id),
  );
  const slotDocs =
    extra.length === 0
      ? []
      : await firestore.getAll(
          ...extra.map((id) => firestore.doc(`${base}/tasks/${id}`)),
        );
  const tasks = [...meetDocs, ...slotDocs.filter((doc) => doc.exists)].flatMap(
    (doc) => {
      const task = toTask(key, doc.id, doc.data() ?? {});
      return task ? [task] : [];
    },
  );
  const habits = habitSnap.docs.flatMap((doc): HabitInput[] => {
    const habit = openLiveHabit(key, doc.id, doc.data(), timeZone);
    return habit ? [{ ...habit, isPrivate: isPrivateHabit(habit) }] : [];
  });
  return { slots, tasks, habits };
};

/** Applies one read-back change to the plan with field-scoped writes; false when the plan has moved on since, so nothing is overwritten. */
export const applyChange = async (
  firestore: Firestore,
  uid: string,
  change: ReadBackChange,
  now: number,
): Promise<boolean> => {
  const base = userPath(uid);
  if (change.kind === 'noted') return true;
  if (change.kind === 'meetMoved') {
    const ref = firestore.doc(`${base}/tasks/${change.taskId}`);
    return firestore.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists || snap.get('status') !== 'open') return false;
      if (
        (toNumber(snap.get('lastEditedAt')) ?? null) !==
          change.expectedChangedAt ||
        toNumber(snap.get('due.at')) !== change.expectedDueAt
      )
        return false;
      transaction.update(
        ref,
        'due.at',
        change.startAt,
        'durationMinutes',
        Math.max(1, Math.round((change.endAt - change.startAt) / 60_000)),
        'lastEditedAt',
        now,
      );
      return true;
    });
  }
  const ref = firestore.doc(`${base}/planDays/${change.dayKey}`);
  return firestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const slot: unknown = snap.get(new FieldPath('slots', change.slotId));
    if (
      !isRecord(slot) ||
      slot.status !== 'kept' ||
      toNumber(slot.decidedAt) !== change.expectedChangedAt
    )
      return false;
    const at = (field: string) => new FieldPath('slots', change.slotId, field);
    if (change.kind === 'slotRemoved') {
      transaction.update(ref, at('status'), 'notToday', at('decidedAt'), now);
      return true;
    }
    transaction.update(
      ref,
      at('startAt'),
      change.startAt,
      at('endAt'),
      change.endAt,
      at('decidedAt'),
      now,
    );
    return true;
  });
};

export const writeActivity = (
  firestore: Firestore,
  uid: string,
  key: HelmKey,
  summary: string,
  now: number,
  isPrivate: boolean,
) =>
  firestore
    .collection(`${userPath(uid)}/executions`)
    .doc()
    .set({
      captureId: null,
      actor: 'nomos',
      via: null,
      category: 'outbound',
      autonomyLevel: AUTOMATIC_LEVEL,
      state: 'succeeded',
      effectRefs: [],
      linkedWhoIds: [],
      linkedPlaceIds: [],
      undoesExecutionId: null,
      undoneByExecutionId: null,
      undoneDocIds: null,
      partUndoIds: null,
      questionRef: null,
      errorCode: null,
      createdAt: now,
      decidedAt: now,
      finishedAt: now,
      privacy: isPrivate ? 'private' : 'ordinary',
      sealed: sealForHelm(key, {
        summary,
        commands: [],
        effects: [],
        undoReport: null,
        abilityOffer: null,
        awayZoneOffer: null,
        spoken: null,
        goneIds: null,
        undoReason: null,
        said: null,
        lines: null,
      }),
    });
