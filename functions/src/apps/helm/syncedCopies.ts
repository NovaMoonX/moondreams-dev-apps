import type { DocumentData, Firestore } from 'firebase-admin/firestore';

import type { SealedPayload } from '../../appKeys/seal.js';
import {
  EXTRA_KEYS,
  readConnectorAppId,
  type ExtraValue,
  type SharedKind,
} from '../../vendor/connectionsContract.js';
import { formatMoney } from '../../utils/formatMoney.js';
import { openForHelm, type HelmKey } from './helmKey.js';

export interface SyncedCopy {
  id: string;
  connectorId: string;
  accountId: string;
  kind: string;
  category: string | null;
  title: string;
  subtitle: string | null;
  startAt: number | null;
  endAt: number | null;
  dueAt: number | null;
  isAllDay: boolean;
  isEnded: boolean;
  detail: string | null;
  placeLabel: string | null;
  amountCents: number | null;
  currency: string | null;
  /** Only the keys the kind's contract allows, scalar values. */
  extra: Record<string, ExtraValue>;
  /** When the source last worked the copy out; null when it did not say. */
  asOf: number | null;
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
export const MAX_CONTEXT_TRIPS = 10;
const TRIP_AHEAD_DAYS = 90;
const TRIP_LOOKBACK_DAYS = 60;
const MAX_SCANNED_TRIPS = 40;
const SUBTITLE_CHARS = 120;
const DETAIL_CHARS = 120;
const MAX_SCANNED_MONEY = 50;
const MAX_CONTEXT_MONEY = 3;
const MAX_SCANNED_STANDING = 120;
const MAX_CONTEXT_STANDING = 8;
const STANDING_KINDS: SharedKind[] = ['project', 'countSummary', 'pet'];
const PLACE_CHARS = 120;

const CONNECTOR_LABELS: Record<string, string> = {
  'app:pinch': 'Pinch',
  'app:a-list': 'A-List',
  'app:going-once': 'Going Once',
  'app:nine-lives': 'Nine Lives',
  'app:runway': 'Runway',
  'app:waypoint': 'Waypoint',
  'app:worth-the-wait': 'Worth the Wait',
  'google:calendar': 'Google Calendar',
  'google:gmail': 'Gmail',
  'google:drive': 'Google Drive',
};

/** The site apps a person can connect, by connector id. */
export const SITE_CONNECTOR_IDS = Object.keys(CONNECTOR_LABELS).filter(
  (id) => readConnectorAppId(id) !== null,
);

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

export const toLocalText = (at: number, timeZone: string) =>
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

export const isSharedKind = (kind: string): kind is SharedKind =>
  Object.hasOwn(EXTRA_KEYS, kind);

const toExtra = (kind: string, value: unknown) => {
  const allowed = isSharedKind(kind) ? EXTRA_KEYS[kind] : [];
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value)
          .filter(
            (entry): entry is [string, ExtraValue] =>
              allowed.includes(entry[0]) &&
              (entry[1] === null ||
                ['string', 'number', 'boolean'].includes(typeof entry[1])),
          )
          .map(([name, extra]) => [
            name,
            typeof extra === 'string' ? extra.slice(0, PLACE_CHARS) : extra,
          ]),
      )
    : {};
};

/** The extras a model is told for each kind of shared record; a new kind has to say which. */
const SHOWN_EXTRAS: Record<SharedKind, string[]> = {
  person: [],
  place: ['phone', 'address'],
  event: ['isTentative', 'isFree'],
  task: [],
  project: [
    'available',
    'pending',
    'sold',
    'newInquiries',
    'collectedCents',
    'leftCents',
  ],
  knowledge: ['rating'],
  artifact: ['status'],
  scenario: [],
  trip: [],
  pet: [],
  moneySummary: ['nextIncomeAt', 'dueBeforeIncomeCents'],
  transaction: ['category'],
  countSummary: ['items', 'revealed', 'notYetRevealed'],
};

/** Opens one synced copy; one that won't open or holds no title is left out. */
export function openSyncedCopy(
  key: HelmKey,
  id: string,
  data: DocumentData,
): SyncedCopy | null {
  try {
    const opened = openForHelm(key, data.sealed as SealedPayload);
    if (typeof opened.title !== 'string' || !opened.title) return null;
    const kind = typeof data.kind === 'string' ? data.kind : '';
    return {
      id,
      connectorId: typeof data.connectorId === 'string' ? data.connectorId : '',
      accountId: typeof data.accountId === 'string' ? data.accountId : '',
      kind,
      category: typeof data.category === 'string' ? data.category : null,
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
      detail:
        typeof opened.detail === 'string' && opened.detail
          ? opened.detail.slice(0, DETAIL_CHARS)
          : null,
      placeLabel:
        typeof opened.placeLabel === 'string' && opened.placeLabel
          ? opened.placeLabel.slice(0, PLACE_CHARS)
          : null,
      amountCents: toNumber(opened.amountCents),
      currency: typeof opened.currency === 'string' ? opened.currency : null,
      extra: toExtra(kind, opened.extra),
      asOf: toNumber(data.sourceUpdatedAt),
    };
  } catch {
    return null;
  }
}

/** What a model is told about a copy: words, times in the person's zone and the source's name. A site app's copy also carries its place, detail, amount and the kind's extras (a shared place's phone and address, a project's counts); a Google copy never does, so calendar locations and descriptions stay out. Never an id, attendees or notes. */
export function toSyncedView(
  copy: SyncedCopy,
  timeZone: string,
  now: number = Date.now(),
) {
  const toWhen = (at: number | null) =>
    at === null
      ? null
      : copy.isAllDay
        ? toDayText(at)
        : toLocalText(at, timeZone);
  const isSite = readConnectorAppId(copy.connectorId) !== null;
  const amount =
    copy.amountCents === null || copy.currency === null
      ? null
      : formatMoney(copy.amountCents, copy.currency);
  const shown = isSharedKind(copy.kind) ? SHOWN_EXTRAS[copy.kind] : [];
  const details = Object.fromEntries(
    shown.flatMap((key): [string, ExtraValue][] => {
      const value = copy.extra[key];
      if (value === undefined || value === null) return [];
      if (key === 'nextIncomeAt' && typeof value === 'number') {
        return [[key, toDayText(value)]];
      }
      return key.endsWith('Cents') &&
        typeof value === 'number' &&
        copy.currency !== null
        ? [[key, formatMoney(value, copy.currency)]]
        : [[key, value]];
    }),
  );
  return {
    title: copy.title,
    kind: copy.kind,
    source: connectorLabel(copy.connectorId),
    ...(copy.kind === 'event' && !isSite ? {} : { subtitle: copy.subtitle }),
    ...(copy.kind === 'moneySummary'
      ? {
          detail: copy.detail,
          amount,
          asOf: copy.asOf === null ? null : toLocalText(copy.asOf, timeZone),
          ageDays:
            copy.asOf === null
              ? null
              : Math.max(0, Math.floor((now - copy.asOf) / DAY_MS)),
        }
      : {}),
    ...(isSite
      ? {
          ...(copy.placeLabel === null ? {} : { place: copy.placeLabel }),
          ...(copy.detail === null ? {} : { detail: copy.detail }),
          ...(amount === null ? {} : { amount }),
          ...(Object.keys(details).length === 0 ? {} : { details }),
        }
      : {}),
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
      // An all-day copy's end is its last day; a timed end is exclusive.
      const lastAt =
        copy.endAt === null || copy.endAt <= copy.startAt
          ? copy.startAt
          : copy.isAllDay
            ? copy.endAt
            : copy.endAt - 1;
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

/** The money summaries other apps share, still connected: one line each, so no date window applies. */
export async function readSyncedMoney(
  firestore: Firestore,
  uid: string,
  key: HelmKey,
) {
  const snapshot = await firestore
    .collection(syncedPath(uid))
    .where('kind', '==', 'moneySummary')
    .limit(MAX_SCANNED_MONEY)
    .get();
  return openAll(key, snapshot.docs)
    .filter((copy) => !copy.isEnded)
    .slice(0, MAX_CONTEXT_MONEY);
}

/** The standing summaries other apps share (a project's counts, a pet), still connected: one line each, so no date window applies. */
export async function readSyncedStanding(
  firestore: Firestore,
  uid: string,
  key: HelmKey,
) {
  const snapshot = await firestore
    .collection(syncedPath(uid))
    .where('kind', 'in', STANDING_KINDS)
    .limit(MAX_SCANNED_STANDING)
    .get();
  return openAll(key, snapshot.docs)
    .filter((copy) => !copy.isEnded)
    .slice(0, MAX_CONTEXT_STANDING);
}

/** The shared money and standing summaries, then today's and tomorrow's events and the week's tasks the context offers; a summary is one line, so it goes first. */
export async function readContextSynced(
  firestore: Firestore,
  uid: string,
  key: HelmKey,
  at: number,
  timeZone: string,
) {
  const firstDay = getLocalDay(at, timeZone);
  const [events, tasks, money, standing] = await Promise.all([
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
    readSyncedMoney(firestore, uid, key),
    readSyncedStanding(firestore, uid, key),
  ]);
  const summaries = [...money, ...standing].slice(0, MAX_CONTEXT_SYNCED);
  return [
    ...summaries,
    ...[...events, ...tasks].slice(
      0,
      Math.max(0, MAX_CONTEXT_SYNCED - summaries.length),
    ),
  ];
}

/** Trips still ahead or under way, starting within 90 days, soonest first; still connected. A trip is a synced copy of kind `trip`. */
export async function readSyncedTrips(
  firestore: Firestore,
  uid: string,
  key: HelmKey,
  input: { firstDay: number; limit: number },
) {
  const snapshot = await firestore
    .collection(syncedPath(uid))
    .where('kind', '==', 'trip')
    .where('startAt', '>=', input.firstDay - TRIP_LOOKBACK_DAYS * DAY_MS)
    .where('startAt', '<', input.firstDay + TRIP_AHEAD_DAYS * DAY_MS)
    .orderBy('startAt')
    .limit(MAX_SCANNED_TRIPS)
    .get();
  return openAll(key, snapshot.docs)
    .filter(
      (copy) =>
        !copy.isEnded && (copy.endAt ?? copy.startAt ?? 0) >= input.firstDay,
    )
    .slice(0, input.limit);
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

/** Copies of one app and/or one kind, opened; equality filters only, so no composite index. */
export async function readFilteredCopies(
  firestore: Firestore,
  uid: string,
  key: HelmKey,
  filter: { connectorId: string | null; kind: string | null },
) {
  const base = firestore.collection(syncedPath(uid));
  const withApp =
    filter.connectorId === null
      ? base
      : base.where('connectorId', '==', filter.connectorId);
  const snapshot = await (
    filter.kind === null ? withApp : withApp.where('kind', '==', filter.kind)
  )
    .limit(MAX_SCANNED_COPIES)
    .get();
  return openAll(key, snapshot.docs);
}
