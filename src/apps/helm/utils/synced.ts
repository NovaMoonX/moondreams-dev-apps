import type { ConnectionGrant } from '@/lib/connections/contract';
import type { ConnectionGrantWithId } from '@/lib/connections/useConnections';
import { getConnectorManifest } from '@/lib/connections/sources';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import { DAY_MS, SYNC_REFRESH_MS, SYNC_STALE_MS } from '@apps/helm/constants';
import { getDueDay } from '@apps/helm/utils/captureReading';
import { mergeSameThings } from '@apps/helm/utils/sameThing';
import type { SyncedRecord } from '@apps/helm/types';

const getDay = (at: number, timeZone: string) =>
  getDueDay({ kind: 'moment', at }, timeZone);

/** Whether a copy falls on the person's today: a timed event on its first and last day in their zone (a stay's check-in and check-out), an all-day one by its UTC dates. */
export const isEventToday = (
  record: SyncedRecord,
  now: number,
  timeZone: string,
) => {
  if (record.kind !== 'event' || record.startAt === null) return false;
  const today = getDay(now, timeZone);
  if (!record.isAllDay) {
    const lastAt = Math.max(record.startAt, (record.endAt ?? 0) - 1);
    return (
      getDay(record.startAt, timeZone) === today ||
      getDay(lastAt, timeZone) === today
    );
  }
  return (
    record.startAt <= today && today < (record.endAt ?? record.startAt) + DAY_MS
  );
};

/** A task copy with no due day is a list the person keeps; one with a day shows from that day on. */
export const isTaskForToday = (
  record: SyncedRecord,
  now: number,
  timeZone: string,
) =>
  record.kind === 'task' &&
  (record.dueAt === null || record.dueAt <= getDay(now, timeZone));

/** "today 9:30 AM", or "Nov 6, 9:30 AM" on another day. */
export const formatUpdatedAt = (at: number, now: number) => {
  const isToday = new Date(at).toDateString() === new Date(now).toDateString();
  return isToday
    ? `today ${formatTime(at)}`
    : `${formatDateShort(at)}, ${formatTime(at)}`;
};

/** The newest time any of a grant's categories was read, or null before the first read. */
export const getNewestOkAt = (grant: ConnectionGrant) =>
  Object.values(grant.categoryState).reduce<number | null>(
    (newest, state) =>
      state.lastOkAt !== null && (newest === null || state.lastOkAt > newest)
        ? state.lastOkAt
        : newest,
    null,
  );

/** A connector read only when the person picks from it is never listed as a source that updates by itself. */
export const syncsInBackground = (
  connectorId: ConnectionGrant['connectorId'],
) => getConnectorManifest(connectorId)?.capabilities.backgroundSync !== false;

/** A category read only when asked has no update time, so no freshness line or refresh ever applies to it. */
export const isLiveCategory = (connectorId: string, categoryId: string) =>
  getConnectorManifest(connectorId)?.categories.find(
    (category) => category.id === categoryId,
  )?.mode === 'live';

export const isStale = (lastOkAt: number | null, now: number) =>
  lastOkAt === null || now - lastOkAt > SYNC_STALE_MS;

/** How many copies the platform holds for a live connection, from the grant itself rather than what this device has loaded. */
export const getGrantCopyCount = (grant: ConnectionGrant) =>
  Object.values(grant.categoryState).reduce(
    (total, state) => total + (state?.count ?? 0),
    0,
  );

/** Whether a live grant asks for an update: its newest read is over 15 minutes old, or a category that is on was never read. */
export const isDueForRefresh = (grant: ConnectionGrant, now: number) => {
  const newest = getNewestOkAt(grant);
  const isSynced = (id: string) =>
    grant.categories[id].isOn && !isLiveCategory(grant.connectorId, id);
  const isOnAndUnread = (id: string) =>
    isSynced(id) &&
    grant.categoryState[id]?.lastOkAt == null &&
    grant.categoryState[id]?.lastError == null;
  return (
    grant.status === 'live' &&
    syncsInBackground(grant.connectorId) &&
    Object.keys(grant.categories).some(isSynced) &&
    (newest === null ||
      now - newest > SYNC_REFRESH_MS ||
      Object.keys(grant.categories).some(isOnAndUnread))
  );
};

export const isCalendarEvent = (record: SyncedRecord) =>
  record.connectorId === 'google:calendar';

/** The copies whose connection still shares them: live with their category on, or kept copies of an ended connection when `includeEnded`. */
export const getLiveRecords = (
  stored: SyncedRecord[],
  grants: ConnectionGrantWithId[],
  includeEnded: boolean,
) =>
  stored.filter((record) => {
    const grant = grants.find((entry) => entry.id === record.grantId);
    if (!grant) return false;
    return grant.status === 'ended'
      ? includeEnded && record.connectionEndedAt !== null
      : grant.categories[record.category]?.isOn === true &&
          record.connectionEndedAt === null;
  });

/** The events of the day `at` falls on, all-day first then by start, each thing once (`mergeSameThings`): one event on two accounts, or on a calendar and in an app, shows the authority's copy. */
export function getDayEvents(
  records: SyncedRecord[],
  at: number,
  timeZone: string,
) {
  const merged = mergeSameThings(
    records
      .filter((record) => isEventToday(record, at, timeZone))
      .sort(
        (a, b) =>
          Number(b.isAllDay) - Number(a.isAllDay) ||
          (a.startAt ?? 0) - (b.startAt ?? 0),
      ),
  );
  const shown = merged.map(({ record }) => record);
  return {
    events: shown,
    merged,
    calendarEvents: shown.filter(isCalendarEvent),
    appEvents: shown.filter((record) => !isCalendarEvent(record)),
  };
}
/** A trip's or event's first day: an all-day one is already a UTC day, a timed one is read in the person's zone. */
export const toFirstDay = (record: SyncedRecord, timeZone: string) =>
  record.startAt === null
    ? null
    : record.isAllDay
      ? record.startAt
      : getDueDay({ kind: 'moment', at: record.startAt }, timeZone);
