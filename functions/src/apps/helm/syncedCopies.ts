import type { DocumentData, Firestore } from 'firebase-admin/firestore';

import type { SealedPayload } from '../../appKeys/seal.js';
import { openForHelm, type HelmKey } from './helmKey.js';

export interface SyncedCopy {
  id: string;
  connectorId: string;
  kind: string;
  title: string;
  subtitle: string | null;
  startAt: number | null;
  endAt: number | null;
  dueAt: number | null;
  isAllDay: boolean;
  isEnded: boolean;
}

export const MAX_CONTEXT_SYNCED = 40;
export const CONTEXT_EVENT_DAYS = 2;
export const CONTEXT_TASK_DAYS = 7;
const DAY_MS = 86_400_000;
const MAX_ZONE_OFFSET_MS = 14 * 3_600_000;
const MAX_SCANNED_EVENTS = 100;
const LOOKBACK_MS = 14 * DAY_MS;
const MAX_LOOKBACK_EVENTS = 40;
const MAX_SCANNED_COPIES = 300;
const SUBTITLE_CHARS = 120;

const CONNECTOR_LABELS: Record<string, string> = {
  'app:pinch': 'Pinch',
  'app:a-list': 'A-List',
  'app:going-once': 'Going Once',
  'app:nine-lives': 'Nine Lives',
  'app:waypoint': 'Waypoint',
  'app:worth-the-wait': 'Worth the Wait',
  'google:calendar': 'Google Calendar',
};

/** The name a person knows a source by, never its id. */
export const connectorLabel = (connectorId: string) =>
  CONNECTOR_LABELS[connectorId] ?? 'a connected app';

const syncedPath = (uid: string) => `apps/helm/users/${uid}/synced`;

export const toKnownZone = (timeZone: string) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions()
      .timeZone;
  } catch {
    return 'UTC';
  }
};

/** The calendar day an instant falls on in `timeZone`, as UTC midnight so days subtract cleanly. */
export const getLocalDay = (at: number, timeZone: string) =>
  Date.parse(
    `${new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at)}T00:00:00Z`,
  );

/** A `YYYY-MM-DD` day as UTC midnight, or null when it is not a real day. */
export const parseDay = (text: string) => {
  const at = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? Date.parse(`${text}T00:00:00Z`)
    : NaN;
  return Number.isNaN(at) ? null : at;
};

const toDayText = (at: number) => new Date(at).toISOString().slice(0, 10);

const toLocalText = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);

const toNumber = (value: unknown) => (typeof value === 'number' ? value : null);

/** Opens one synced copy; one that won't open or holds no title is left out. */
export function openSyncedCopy(
  key: HelmKey,
  id: string,
  data: DocumentData,
): SyncedCopy | null {
  try {
    const opened = openForHelm(key, data.sealed as SealedPayload);
    if (typeof opened.title !== 'string' || !opened.title) return null;
    return {
      id,
      connectorId: typeof data.connectorId === 'string' ? data.connectorId : '',
      kind: typeof data.kind === 'string' ? data.kind : '',
      title: opened.title,
      subtitle:
        typeof opened.subtitle === 'string' && opened.subtitle
          ? opened.subtitle.slice(0, SUBTITLE_CHARS)
          : null,
      startAt: toNumber(data.startAt),
      endAt: toNumber(data.endAt),
      dueAt: toNumber(data.dueAt),
      isAllDay: data.isAllDay === true,
      isEnded: (data.connectionEndedAt ?? null) !== null,
    };
  } catch {
    return null;
  }
}

/** What a model is told about a copy: words, times in the person's zone and the source's name. Never an id, an address, attendees or notes. */
export function toSyncedView(copy: SyncedCopy, timeZone: string) {
  const toWhen = (at: number | null) =>
    at === null
      ? null
      : copy.isAllDay
        ? toDayText(at)
        : toLocalText(at, timeZone);
  return {
    title: copy.title,
    kind: copy.kind,
    source: connectorLabel(copy.connectorId),
    ...(copy.kind === 'event' ? {} : { subtitle: copy.subtitle }),
    start: toWhen(copy.startAt),
    end: toWhen(copy.endAt),
    due: copy.dueAt === null ? null : toDayText(copy.dueAt),
    isAllDay: copy.isAllDay,
  };
}

const openAll = (
  key: HelmKey,
  docs: { id: string; data: () => DocumentData }[],
) =>
  docs.flatMap((doc) => {
    const copy = openSyncedCopy(key, doc.id, doc.data());
    return copy ? [copy] : [];
  });

const toDay = (at: number, isAllDay: boolean, timeZone: string) =>
  isAllDay ? at : getLocalDay(at, timeZone);

/** Events on any of `days` calendar days from `firstDay` (UTC midnight of a day in the person's zone), one that began up to two weeks earlier and runs into them included; still connected, soonest first. */
export async function readSyncedEvents(
  firestore: Firestore,
  uid: string,
  key: HelmKey,
  input: { firstDay: number; days: number; timeZone: string; limit: number },
) {
  const end = input.firstDay + input.days * DAY_MS;
  const [inside, before] = await Promise.all([
    firestore
      .collection(syncedPath(uid))
      .where('kind', '==', 'event')
      .where('startAt', '>=', input.firstDay - MAX_ZONE_OFFSET_MS)
      .where('startAt', '<', end + MAX_ZONE_OFFSET_MS)
      .orderBy('startAt')
      .limit(Math.min(MAX_SCANNED_EVENTS, input.limit * 2))
      .get(),
    firestore
      .collection(syncedPath(uid))
      .where('kind', '==', 'event')
      .where('startAt', '>=', input.firstDay - LOOKBACK_MS)
      .where('startAt', '<', input.firstDay + MAX_ZONE_OFFSET_MS)
      .orderBy('startAt', 'desc')
      .limit(MAX_LOOKBACK_EVENTS)
      .get(),
  ]);
  const seen = new Set<string>();
  return openAll(key, [...before.docs.reverse(), ...inside.docs])
    .filter((copy) => {
      if (seen.has(copy.id) || copy.isEnded || copy.startAt === null) {
        return false;
      }
      seen.add(copy.id);
      const firstOn = toDay(copy.startAt, copy.isAllDay, input.timeZone);
      const lastAt =
        copy.endAt !== null && copy.endAt > copy.startAt
          ? copy.endAt - (copy.isAllDay ? DAY_MS : 1)
          : copy.startAt;
      const lastOn = toDay(lastAt, copy.isAllDay, input.timeZone);
      return firstOn < end && lastOn >= input.firstDay;
    })
    .slice(0, input.limit);
}

/** Tasks from other apps due in `days` calendar days from `firstDay`, still connected, soonest first. */
export async function readSyncedTasks(
  firestore: Firestore,
  uid: string,
  key: HelmKey,
  input: { firstDay: number; days: number; limit: number },
) {
  const snapshot = await firestore
    .collection(syncedPath(uid))
    .where('kind', '==', 'task')
    .where('dueAt', '>=', input.firstDay)
    .where('dueAt', '<', input.firstDay + input.days * DAY_MS)
    .orderBy('dueAt')
    .limit(input.limit * 2)
    .get();
  return openAll(key, snapshot.docs)
    .filter((copy) => !copy.isEnded)
    .slice(0, input.limit);
}

/** Today's and tomorrow's events and the week's tasks the context offers, events first. */
export async function readContextSynced(
  firestore: Firestore,
  uid: string,
  key: HelmKey,
  at: number,
  timeZone: string,
) {
  const firstDay = getLocalDay(at, timeZone);
  const [events, tasks] = await Promise.all([
    readSyncedEvents(firestore, uid, key, {
      firstDay,
      days: CONTEXT_EVENT_DAYS,
      timeZone,
      limit: MAX_CONTEXT_SYNCED,
    }),
    readSyncedTasks(firestore, uid, key, {
      firstDay,
      days: CONTEXT_TASK_DAYS,
      limit: MAX_CONTEXT_SYNCED,
    }),
  ]);
  return [...events, ...tasks].slice(0, MAX_CONTEXT_SYNCED);
}

/** The newest-synced copies, opened, so words can be matched against titles that only the key can read. */
export async function readRecentCopies(
  firestore: Firestore,
  uid: string,
  key: HelmKey,
) {
  const snapshot = await firestore
    .collection(syncedPath(uid))
    .orderBy('syncedAt', 'desc')
    .limit(MAX_SCANNED_COPIES)
    .get();
  return openAll(key, snapshot.docs);
}
