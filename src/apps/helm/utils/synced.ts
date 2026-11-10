import type { ConnectionGrant } from '@/lib/connections/contract';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import { DAY_MS, SYNC_REFRESH_MS, SYNC_STALE_MS } from '@apps/helm/constants';
import { getDueDay } from '@apps/helm/utils/captureReading';
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
  const isOnAndUnread = (id: string) =>
    grant.categories[id].isOn &&
    grant.categoryState[id]?.lastOkAt == null &&
    grant.categoryState[id]?.lastError == null;
  return (
    grant.status === 'live' &&
    Object.values(grant.categories).some((category) => category.isOn) &&
    (newest === null ||
      now - newest > SYNC_REFRESH_MS ||
      Object.keys(grant.categories).some(isOnAndUnread))
  );
};
