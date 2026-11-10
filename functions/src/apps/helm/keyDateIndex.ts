// Generated from src/apps/helm/utils/keyDateIndex.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
export type KeyDateIndexKind = 'birthday' | 'anniversary' | 'custom';

/** `[keyDateId, kind, month, day, year, label]`: a tuple keeps the sealed document small. */
export type IndexEntry = [
  keyDateId: string,
  kind: KeyDateIndexKind,
  month: number,
  day: number | null,
  year: number | null,
  label: string | null,
];

export type ByWho = Record<string, IndexEntry[]>;

export type IndexChange =
  | { op: 'upsert'; whoId: string; entry: IndexEntry }
  | { op: 'remove'; whoId: string; keyDateId: string }
  | { op: 'removeWho'; whoId: string };

/** One document holds this many entries before the index splits into twelve month documents. */
export const INDEX_SPLIT_AT = 2_000;

export const INDEX_DOC = 'keyDateIndex';

export const monthDocId = (month: number) =>
  `${INDEX_DOC}-${String(month).padStart(2, '0')}`;

export const MONTH_DOC_IDS = Array.from({ length: 12 }, (_, index) =>
  monthDocId(index + 1),
);

export const countEntries = (byWho: ByWho) =>
  Object.values(byWho).reduce((total, entries) => total + entries.length, 0);

const withWho = (byWho: ByWho, whoId: string, entries: IndexEntry[]): ByWho => {
  const rest = Object.fromEntries(
    Object.entries(byWho).filter(([id]) => id !== whoId),
  );
  return entries.length === 0 ? rest : { ...rest, [whoId]: entries };
};

const applyOne = (byWho: ByWho, change: IndexChange): ByWho => {
  if (change.op === 'removeWho') return withWho(byWho, change.whoId, []);
  const current = byWho[change.whoId] ?? [];
  if (change.op === 'remove') {
    return withWho(
      byWho,
      change.whoId,
      current.filter((entry) => entry[0] !== change.keyDateId),
    );
  }
  const others = current.filter((entry) => entry[0] !== change.entry[0]);
  return withWho(byWho, change.whoId, [...others, change.entry]);
};

/** Applies one change and returns the new map with its entry count; a who with no entries left is dropped from the map. */
export function applyToKeyDateIndex(
  byWho: ByWho,
  change: IndexChange,
): { byWho: ByWho; entryCount: number } {
  const next = applyOne(byWho, change);
  return { byWho: next, entryCount: countEntries(next) };
}

/** Applies each change in order. */
export const applyChanges = (byWho: ByWho, changes: IndexChange[]) =>
  changes.reduce(
    (result, change) => applyToKeyDateIndex(result.byWho, change),
    { byWho, entryCount: countEntries(byWho) },
  );

/** The twelve month maps, by each entry's month (index 0 is January). */
export function splitByMonth(byWho: ByWho): ByWho[] {
  return Array.from({ length: 12 }, (_, index) =>
    Object.fromEntries(
      Object.entries(byWho).flatMap(([whoId, entries]) => {
        const kept = entries.filter((entry) => entry[2] === index + 1);
        return kept.length > 0 ? [[whoId, kept]] : [];
      }),
    ),
  );
}

const groupByWho = (records: { whoId: string; entry: IndexEntry }[]): ByWho =>
  Object.fromEntries(
    records.reduce(
      (groups, { whoId, entry }) =>
        groups.set(whoId, [...(groups.get(whoId) ?? []), entry]),
      new Map<string, IndexEntry[]>(),
    ),
  );

export const mergeMonths = (parts: ByWho[]): ByWho =>
  groupByWho(
    parts.flatMap((part) =>
      Object.entries(part).flatMap(([whoId, entries]) =>
        entries.map((entry) => ({ whoId, entry })),
      ),
    ),
  );

/** What to store for a map: one document, or twelve once it passes the split. `ids` are the documents to write; every other index document is deleted. */
export function planIndexWrite(byWho: ByWho): {
  docs: { id: string; byWho: ByWho; entryCount: number }[];
  deleteIds: string[];
} {
  const entryCount = countEntries(byWho);
  if (entryCount <= INDEX_SPLIT_AT) {
    return {
      docs: [{ id: INDEX_DOC, byWho, entryCount }],
      deleteIds: MONTH_DOC_IDS,
    };
  }
  return {
    docs: splitByMonth(byWho).map((part, index) => ({
      id: monthDocId(index + 1),
      byWho: part,
      entryCount: countEntries(part),
    })),
    deleteIds: [INDEX_DOC],
  };
}

/** The index and the who records disagree: the sum of their counters is not the entries held. */
export const isIndexDrifted = (entryCount: number, countedByWho: number) =>
  entryCount !== countedByWho;

/** Builds the map from every yearly date in the records. */
export const buildByWho = groupByWho;
