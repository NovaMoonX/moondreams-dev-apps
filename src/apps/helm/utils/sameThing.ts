import { createOptionMatcher } from '@/utils/optionMatchUtils';
import { pickTimeAuthority } from '@apps/helm/engine/authority';
import type { SyncedRecord } from '@apps/helm/types';

export const SAME_THING_MINUTES = 15;

const titles = createOptionMatcher();

const isSameKey = (a: SyncedRecord, b: SyncedRecord) => {
  const key = a.sealed.extra.sameEventKey;
  return typeof key === 'string' && key === b.sealed.extra.sameEventKey;
};

/** Two copies from different sources (or accounts) that are one event: titles that match and starts within 15 minutes. */
export const isSameThing = (a: SyncedRecord, b: SyncedRecord) => {
  if (isSameKey(a, b)) return true;
  if (a.grantId === b.grantId || a.isAllDay !== b.isAllDay) return false;
  if (a.startAt === null || b.startAt === null) return false;
  return (
    Math.abs(a.startAt - b.startAt) <= SAME_THING_MINUTES * 60_000 &&
    titles.match(a.sealed.title, [b.sealed.title]) !== null
  );
};

export interface MergedEvent {
  record: SyncedRecord;
  alsoIn: SyncedRecord[];
}

/** A day's events with each thing once: the authority's copy shown, the other sources' copies beside it. */
export const mergeSameThings = (records: SyncedRecord[]): MergedEvent[] =>
  records
    .reduce<SyncedRecord[][]>((groups, record) => {
      const group = groups.find((copies) =>
        copies.some((other) => isSameThing(other, record)),
      );
      return group
        ? groups.map((copies) =>
            copies === group ? [...copies, record] : copies,
          )
        : [...groups, [record]];
    }, [])
    .map((copies) => {
      const record = pickTimeAuthority(copies);
      return { record, alsoIn: copies.filter((copy) => copy !== record) };
    });
