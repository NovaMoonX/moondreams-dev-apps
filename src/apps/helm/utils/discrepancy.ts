import type { FactField, OpenFact, SyncedRecord } from '@apps/helm/types';

/** A clock written the way the server stores it ("9:05 AM"); text that isn't a clock comes back trimmed. */
const toClock = (text: string) => {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i.exec(text.trim());
  return match
    ? `${Number(match[1])}:${match[2] ?? '00'} ${(match[3] ?? 'a').toUpperCase()}M`
    : text.trim();
};

/** What the copy itself says for the field a fact is about, in the words the fact's value uses and the given time zone; null when it says nothing. */
export const getCopyValue = (
  record: SyncedRecord,
  field: FactField,
  timeZone: string,
) => {
  if (field === 'place') return record.sealed.placeLabel;
  const at = field === 'startAt' ? record.startAt : record.endAt;
  return at === null || record.isAllDay
    ? null
    : toClock(
        new Intl.DateTimeFormat('en-US', {
          timeZone,
          hour: 'numeric',
          minute: '2-digit',
        }).format(at),
      );
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
  timeZone: string,
): Discrepancy | null => {
  const isKept = facts.some(
    (entry) =>
      entry.status === 'confirmed' &&
      entry.syncedIds.includes(record.id) &&
      entry.keptOverSource?.syncedId === record.id &&
      entry.keptOverSource.contentHash === record.contentHash,
  );
  if (isKept) return null;
  const fact = facts.find(
    (entry) =>
      entry.status === 'inferred' &&
      entry.aboutField !== null &&
      entry.value !== null &&
      entry.keptOverSource === null &&
      entry.syncedIds.includes(record.id),
  );
  if (!fact?.aboutField || fact.value === null) return null;
  const copyValue = getCopyValue(record, fact.aboutField, timeZone);
  const isSame =
    fact.aboutField === 'place'
      ? copyValue === fact.value
      : copyValue !== null && copyValue === toClock(fact.value);
  return isSame ? null : { fact, field: fact.aboutField, value: fact.value };
};
