import type { SyncedRecord } from '@apps/helm/types';

const isCalendarCopy = (record: SyncedRecord) =>
  record.connectorId === 'google:calendar';

/** The copy whose time an event shows: a calendar's over an app's, otherwise the first. */
export const pickTimeAuthority = (copies: SyncedRecord[]) =>
  copies.find(isCalendarCopy) ?? copies[0];

/** An app's place for an event whose shown copy has none (a showing's theater). */
export const findPlace = (shown: SyncedRecord, others: SyncedRecord[]) =>
  shown.sealed.placeLabel ??
  others.find((other) => other.sealed.placeLabel !== null)?.sealed.placeLabel ??
  null;

/** Another copy whose start differs from the shown one (another app's, or another account's calendar), for the one line that says so; null when they agree. */
export const findOtherTime = (shown: SyncedRecord, others: SyncedRecord[]) =>
  others.find(
    (other) =>
      !other.isAllDay &&
      !shown.isAllDay &&
      other.startAt !== null &&
      shown.startAt !== null &&
      other.startAt !== shown.startAt,
  ) ?? null;
