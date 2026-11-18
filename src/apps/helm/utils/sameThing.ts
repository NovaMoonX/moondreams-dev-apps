import { createOptionMatcher } from '@/utils/optionMatchUtils';
import { pickTimeAuthority } from '@apps/helm/engine/authority';
import type { SyncedRecord } from '@apps/helm/types';

export const SAME_THING_MINUTES = 15;

const WINDOW_MS = SAME_THING_MINUTES * 60_000;

const titles = createOptionMatcher();

const isNear = (a: SyncedRecord, b: SyncedRecord) =>
  a.startAt !== null &&
  b.startAt !== null &&
  Math.abs(a.startAt - b.startAt) <= WINDOW_MS;

const isSameKey = (a: SyncedRecord, b: SyncedRecord) => {
  const key = a.sealed.extra.sameEventKey;
  return typeof key === 'string' && key === b.sealed.extra.sameEventKey;
};

/** Two copies that are one event: the same event key, or titles that match from different sources (or accounts); either way starting within 15 minutes. */
export const isSameThing = (a: SyncedRecord, b: SyncedRecord) => {
  if (a.isAllDay !== b.isAllDay || !isNear(a, b)) return false;
  if (isSameKey(a, b)) return true;
  return (
    a.grantId !== b.grantId &&
    titles.match(a.sealed.title, [b.sealed.title]) !== null
  );
};

export interface MergedEvent {
  record: SyncedRecord;
  alsoIn: SyncedRecord[];
}

const startOf = (record: SyncedRecord) => record.startAt ?? 0;

/** A day's events (sorted by start) with each thing once: the authority's copy shown, the other copies beside it. A copy joins a group only by matching its first copy, so matches never chain past the window. */
export const mergeSameThings = (records: SyncedRecord[]): MergedEvent[] =>
  records
    .reduce<SyncedRecord[][]>((groups, record) => {
      // Mutated in place: a busy day holds a thousand copies.
      const group = groups.find(
        (copies) =>
          isSameThing(copies[0], record) &&
          copies.every(
            (copy) =>
              copy.grantId !== record.grantId || isSameKey(copy, record),
          ),
      );
      if (group) group.push(record);
      else groups.push([record]);
      return groups;
    }, [])
    .map((copies) => {
      const record = pickTimeAuthority(copies);
      return { record, alsoIn: copies.filter((copy) => copy !== record) };
    })
    .sort(
      (a, b) =>
        Number(b.record.isAllDay) - Number(a.record.isAllDay) ||
        startOf(a.record) - startOf(b.record),
    );
