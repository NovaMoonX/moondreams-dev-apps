import { createHash } from 'node:crypto';

import { getFirestore } from 'firebase-admin/firestore';

import {
  MAX_RECORDS_PER_CATEGORY,
  type ConnectorOption,
  type SharedRecord,
} from '../../vendor/connectionsContract.js';
import type {
  SourceAdapter,
  SourceStatus,
  SyncPageRequest,
  SyncPageResult,
} from '../registry.js';
import { GOOGLE_SECRETS, getGoogleAccessToken } from '../tokens.js';
import { googleGet, SyncTokenGone, toReconnectOnRefusal } from './client.js';
import { GOOGLE_CALENDAR_MANIFEST } from './calendarManifest.js';
import { toEventLink } from './deepLinks.js';

const API = 'https://www.googleapis.com/calendar/v3';
const EVENT_FIELDS =
  'items(id,status,summary,start,end,iCalUID,attendees(self,responseStatus),transparency,updated),nextPageToken,nextSyncToken';
const LIST_FIELDS =
  'items(id,summary,summaryOverride,backgroundColor,primary,accessRole)';
const PAGE_SIZE = 250;
const UPCOMING_CAP = MAX_RECORDS_PER_CATEGORY;
const OPTION_LIMIT = 250;
const CLOCK_SKEW_MS = 60_000;
const DAY_MS = 86_400_000;
const QUIET_MARKERS = ['#holiday@', '#contacts@', '#weeknum@'];

interface EventTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface CalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: EventTime;
  end?: EventTime;
  iCalUID?: string;
  attendees?: { self?: boolean; responseStatus?: string }[];
  transparency?: string;
  updated?: string;
}

interface EventsPage {
  items?: CalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

interface CalendarListEntry {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole?: string;
}

/** What a finished read keeps for the next one: a sync token per calendar, or null where Google gave none, and the winning ref of each event key that had a copy dropped. */
interface Saved {
  calendarIds: string[];
  syncedAt: number;
  tokens: Record<string, string | null>;
  dupes: Record<string, string>;
}

interface Progress {
  pageToken: string | null;
  isDone: boolean;
  token: string | null;
}

interface Cursor {
  calendarIds: string[];
  startedAt: number;
  isIncremental: boolean;
  prior: Saved | null;
  progress: Record<string, Progress>;
  seen: Record<string, string>;
  dupes: Record<string, string>;
  emitted: number;
  isCapped: boolean;
  isWinnerGone: boolean;
}

interface Round {
  cursor: Cursor;
  records: SharedRecord[];
  deletedRefs: string[];
}

type Outcome =
  | { kind: 'gone'; ref: string }
  | { kind: 'record'; record: SharedRecord; key: string };

const iso = (at: number) => new Date(at).toISOString();

const parseSaved = (text: string | null): Saved | null => {
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as Partial<Saved>;
    return Array.isArray(value.calendarIds) &&
      typeof value.syncedAt === 'number' &&
      typeof value.tokens === 'object' &&
      value.tokens !== null
      ? {
          calendarIds: value.calendarIds,
          syncedAt: value.syncedAt,
          tokens: value.tokens,
          dupes:
            typeof value.dupes === 'object' && value.dupes !== null
              ? value.dupes
              : {},
        }
      : null;
  } catch {
    return null;
  }
};

const isSameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

const startCursor = (
  calendarIds: string[],
  prior: Saved | null,
  startedAt: number,
): Cursor => ({
  calendarIds,
  startedAt,
  isIncremental: prior !== null,
  prior,
  progress: Object.fromEntries(
    calendarIds.map((id) => [
      id,
      { pageToken: null, isDone: false, token: null },
    ]),
  ),
  seen: {},
  dupes: prior?.dupes ?? {},
  emitted: 0,
  isCapped: false,
  isWinnerGone: false,
});

const readParams = (
  cursor: Cursor,
  calendarId: string,
  windowStart: number,
): Record<string, string> => {
  if (!cursor.prior) return { timeMin: iso(windowStart) };
  const token = cursor.prior.tokens[calendarId] ?? null;
  return token
    ? { syncToken: token }
    : {
        timeMin: iso(windowStart),
        updatedMin: iso(cursor.prior.syncedAt - CLOCK_SKEW_MS),
      };
};

const toEventsUrl = (
  cursor: Cursor,
  calendarId: string,
  windowStart: number,
  pageToken: string | null,
) => {
  const params = new URLSearchParams({
    singleEvents: 'true',
    maxResults: String(PAGE_SIZE),
    fields: EVENT_FIELDS,
    ...readParams(cursor, calendarId, windowStart),
    ...(pageToken ? { pageToken } : {}),
  });
  return `${API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
};

const toKeyStart = (time: EventTime | undefined) => {
  if (time?.date) return time.date;
  return time?.dateTime ? String(Date.parse(time.dateTime)) : '';
};

const toSameEventKey = (event: CalendarEvent) =>
  createHash('sha256')
    .update(`${event.iCalUID ?? event.id}|${toKeyStart(event.start)}`)
    .digest('hex')
    .slice(0, 16);

const toInstants = (event: CalendarEvent) => {
  const { start, end } = event;
  if (start?.date) {
    const startAt = Date.parse(`${start.date}T00:00:00Z`);
    // Google's all-day end is the day after the last; copies keep the last day.
    const endAt = end?.date
      ? Date.parse(`${end.date}T00:00:00Z`) - DAY_MS
      : startAt;
    return { startAt, endAt: Math.max(startAt, endAt), isAllDay: true };
  }
  return {
    startAt: start?.dateTime ? Date.parse(start.dateTime) : null,
    endAt: end?.dateTime ? Date.parse(end.dateTime) : null,
    isAllDay: false,
  };
};

const self = (event: CalendarEvent) =>
  event.attendees?.find((attendee) => attendee.self === true);

const toRecord = (calendarId: string, event: CalendarEvent): SharedRecord => ({
  sourceRef: `${calendarId}|${event.id}`,
  kind: 'event',
  title: event.summary || 'Untitled event',
  subtitle: null,
  detail: null,
  ...toInstants(event),
  dueAt: null,
  timeZone: event.start?.timeZone ?? null,
  placeLabel: null,
  amountCents: null,
  currency: null,
  sourceUpdatedAt: event.updated ? Date.parse(event.updated) : null,
  extra: {
    calendarId,
    isTentative:
      event.status === 'tentative' ||
      self(event)?.responseStatus === 'tentative',
    isFree: event.transparency === 'transparent',
    sameEventKey: toSameEventKey(event),
  },
});

const toOutcome = (
  calendarId: string,
  event: CalendarEvent,
): Outcome | null => {
  const ref = `${calendarId}|${event.id}`;
  if (
    event.status === 'cancelled' ||
    self(event)?.responseStatus === 'declined'
  )
    return { kind: 'gone', ref };
  if (!event.start) return null;
  return {
    kind: 'record',
    record: toRecord(calendarId, event),
    key: toSameEventKey(event),
  };
};

interface Dedupe {
  seen: Record<string, string>;
  dupes: Record<string, string>;
  fresh: SharedRecord[];
}

/** The first copy of an event wins; a later copy under another ref is dropped and its winner remembered. */
const dedupe = (state: Dedupe, outcome: Outcome): Dedupe => {
  if (outcome.kind !== 'record') return state;
  const { key, record } = outcome;
  const winner = state.seen[key] ?? state.dupes[key];
  if (winner !== undefined && winner !== record.sourceRef)
    return { ...state, dupes: { ...state.dupes, [key]: winner } };
  if (state.seen[key] !== undefined) return state;
  return {
    ...state,
    seen: { ...state.seen, [key]: record.sourceRef },
    fresh: [...state.fresh, record],
  };
};

const readCalendar = async (
  token: string,
  req: SyncPageRequest,
  acc: Round,
  calendarId: string,
): Promise<Round> => {
  const { cursor } = acc;
  const progress = cursor.progress[calendarId];
  if (progress.isDone) return acc;
  const page = await googleGet<EventsPage>(
    token,
    toEventsUrl(cursor, calendarId, req.windowStart, progress.pageToken),
  );
  const outcomes = (page.items ?? []).flatMap((event) => {
    const outcome = toOutcome(calendarId, event);
    return outcome ? [outcome] : [];
  });
  const start: Dedupe = {
    seen: {
      ...cursor.seen,
      ...Object.fromEntries(
        acc.records.map((record) => [
          String(record.extra.sameEventKey),
          record.sourceRef,
        ]),
      ),
    },
    dupes: cursor.dupes,
    fresh: [],
  };
  const deduped = outcomes.reduce(dedupe, start);
  const deletedRefs = outcomes.flatMap((outcome) =>
    outcome.kind === 'gone' ? [outcome.ref] : [],
  );
  const winners = Object.values(deduped.dupes);
  const isLast = !page.nextPageToken;
  return {
    cursor: {
      ...cursor,
      dupes: deduped.dupes,
      isWinnerGone:
        cursor.isWinnerGone || deletedRefs.some((ref) => winners.includes(ref)),
      progress: {
        ...cursor.progress,
        [calendarId]: {
          pageToken: page.nextPageToken ?? null,
          isDone: isLast,
          token: isLast ? (page.nextSyncToken ?? null) : null,
        },
      },
    },
    records: [...acc.records, ...deduped.fresh],
    deletedRefs: [...acc.deletedRefs, ...deletedRefs],
  };
};

const readRound = async (
  token: string,
  req: SyncPageRequest,
  cursor: Cursor,
): Promise<Round> => {
  const round = await cursor.calendarIds.reduce<Promise<Round>>(
    async (done, calendarId) =>
      readCalendar(token, req, await done, calendarId),
    Promise.resolve({ cursor, records: [], deletedRefs: [] }),
  );
  const room = Math.max(0, UPCOMING_CAP - cursor.emitted);
  const kept = [...round.records]
    .sort((a, b) => (a.startAt ?? 0) - (b.startAt ?? 0))
    .slice(0, room);
  const emitted = cursor.emitted + kept.length;
  const isCapped = emitted >= UPCOMING_CAP;
  return {
    cursor: {
      ...round.cursor,
      emitted,
      isCapped: round.cursor.isCapped || isCapped,
      seen: {
        ...cursor.seen,
        ...Object.fromEntries(
          round.records.map((record) => [
            String(record.extra.sameEventKey),
            record.sourceRef,
          ]),
        ),
      },
      progress: isCapped
        ? Object.fromEntries(
            Object.entries(round.cursor.progress).map(([id, progress]) => [
              id,
              { ...progress, isDone: true },
            ]),
          )
        : round.cursor.progress,
    },
    records: kept,
    deletedRefs: round.deletedRefs,
  };
};

const readOrRestart = async (
  token: string,
  req: SyncPageRequest,
  cursor: Cursor,
) => {
  try {
    return await readRound(token, req, cursor);
  } catch (error) {
    if (!(error instanceof SyncTokenGone) || !cursor.prior) throw error;
    return readRound(
      token,
      req,
      startCursor(cursor.calendarIds, null, cursor.startedAt),
    );
  }
};

const firstRound = (
  token: string,
  req: SyncPageRequest,
  calendarIds: string[],
) => {
  const saved = parseSaved(req.resumeState);
  const prior =
    saved && isSameSet(saved.calendarIds, calendarIds) ? saved : null;
  return readOrRestart(token, req, startCursor(calendarIds, prior, Date.now()));
};

const toResult = ({ cursor, records, deletedRefs }: Round): SyncPageResult => {
  const isDone = Object.values(cursor.progress).every(
    (progress) => progress.isDone,
  );
  const saved: Saved = {
    calendarIds: cursor.calendarIds,
    syncedAt: cursor.startedAt,
    tokens: Object.fromEntries(
      Object.entries(cursor.progress).map(([id, progress]) => [
        id,
        progress.token,
      ]),
    ),
    dupes: cursor.dupes,
  };
  // Nothing saved means the next read is a full one.
  const isForcedFull = cursor.isCapped || cursor.isWinnerGone;
  return {
    records,
    deletedRefs,
    cursor: isDone ? null : JSON.stringify(cursor),
    isFull: !cursor.isIncremental,
    isDone,
    resumeState: isDone && !isForcedFull ? JSON.stringify(saved) : null,
  };
};

const isOnByDefault = (entry: CalendarListEntry) =>
  entry.primary === true ||
  ((entry.accessRole === 'owner' || entry.accessRole === 'writer') &&
    !QUIET_MARKERS.some((marker) => entry.id.includes(marker)));

const toOption = (entry: CalendarListEntry): ConnectorOption => ({
  id: entry.id,
  name: entry.summaryOverride ?? entry.summary ?? entry.id,
  colour: entry.backgroundColor ?? null,
  detail: null,
  photoUrl: null,
  isPrimary: entry.primary === true,
  isOnByDefault: isOnByDefault(entry),
});

const accountPath = (uid: string, accountId: string) =>
  `connections/${uid}/accounts/${accountId}`;

export function createGoogleCalendarAdapter(): SourceAdapter {
  return {
    manifest: GOOGLE_CALENDAR_MANIFEST,
    secrets: GOOGLE_SECRETS,
    status: async (ctx): Promise<SourceStatus> => {
      const account = await getFirestore()
        .doc(accountPath(ctx.uid, ctx.accountId))
        .get();
      const state = account.get('status');
      if (!account.exists || state === 'revoked') return 'noAccess';
      return state === 'needsReconnect' ? 'needsReconnect' : 'ok';
    },
    syncPage: async (ctx, req) => {
      const calendarIds = Array.from(
        new Set(ctx.grant.options?.calendarIds ?? []),
      );
      if (calendarIds.length === 0)
        return {
          records: [],
          deletedRefs: [],
          cursor: null,
          isFull: true,
          isDone: true,
          resumeState: null,
        };
      const token = await getGoogleAccessToken(
        getFirestore(),
        ctx.uid,
        ctx.accountId,
      );
      return toResult(
        req.cursor
          ? await readOrRestart(token, req, JSON.parse(req.cursor) as Cursor)
          : await firstRound(token, req, calendarIds),
      );
    },
    deepLink: (ref) => {
      const split = ref.indexOf('|');
      return split < 0
        ? null
        : toEventLink(ref.slice(0, split), ref.slice(split + 1));
    },
    readOptions: async ({ firestore, uid, accountId }) => {
      const [token, account] = await Promise.all([
        getGoogleAccessToken(firestore, uid, accountId),
        firestore.doc(accountPath(uid, accountId)).get(),
      ]);
      const email = account.get('email');
      const params = new URLSearchParams({
        maxResults: String(OPTION_LIMIT),
        fields: LIST_FIELDS,
      });
      const list = await googleGet<{ items?: CalendarListEntry[] }>(
        token,
        `${API}/users/me/calendarList?${params}`,
        { email: typeof email === 'string' ? email : null },
      ).catch(toReconnectOnRefusal);
      return (list.items ?? []).slice(0, OPTION_LIMIT).map(toOption);
    },
  };
}
