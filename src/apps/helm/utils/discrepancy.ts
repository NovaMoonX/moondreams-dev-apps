import { formatTime } from '@/utils/formatUtils';
import type { FactField, OpenFact, SyncedRecord } from '@apps/helm/types';

/** What the copy itself says for the field a fact is about, in the words the fact's value uses; null when it says nothing. */
export const getCopyValue = (record: SyncedRecord, field: FactField) => {
  if (field === 'place') return record.sealed.placeLabel;
  const at = field === 'startAt' ? record.startAt : record.endAt;
  return at === null || record.isAllDay ? null : formatTime(at);
};

export interface Discrepancy {
  fact: OpenFact;
  field: FactField;
  /** What the email says. */
  value: string;
}

/** The inferred fact that disagrees with a copy and has not been answered, or null. */
export const findDiscrepancy = (
  record: SyncedRecord,
  facts: OpenFact[],
): Discrepancy | null => {
  const fact = facts.find(
    (entry) =>
      entry.status === 'inferred' &&
      entry.aboutField !== null &&
      entry.value !== null &&
      entry.keptOverSource === null &&
      entry.syncedIds.includes(record.id),
  );
  if (!fact?.aboutField || fact.value === null) return null;
  return getCopyValue(record, fact.aboutField) === fact.value
    ? null
    : { fact, field: fact.aboutField, value: fact.value };
};
