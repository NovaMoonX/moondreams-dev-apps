import type {
  Cents,
  CorrectionChange,
  CorrectionSealed,
  OpenRecord,
  RecordLine,
  Stance,
} from '@apps/runway/types';

import { applyLineEdits, getRemainder } from './differences';

/** The split a day stands on now: the confirmed one, or the latest correction. */
export interface EffectiveSplit {
  recordId: string;
  dayId: string;
  kind: 'confirmed' | 'correction';
  stance: Stance;
  arrivedCents: Cents;
  freeToSpendCents: Cents;
  lines: RecordLine[];
}

type SplitRecord = Exclude<OpenRecord, { kind: 'proposed' }>;

const byCreation = (a: SplitRecord, b: SplitRecord) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * One day's records from the confirmed one forward: each step is the correction that names the
 * record before it. A correction no chain reaches is left out, and if two name the same record the
 * earlier one wins, so every device reads the same chain.
 */
export function getRecordChain(records: readonly OpenRecord[]): SplitRecord[] {
  const splits = records.filter(
    (record): record is SplitRecord => record.kind !== 'proposed',
  );
  const first = splits.find((record) => record.kind === 'confirmed');
  if (!first) return [];
  const next = (current: SplitRecord) =>
    splits
      .filter(
        (record) =>
          record.kind === 'correction' && record.supersedesId === current.id,
      )
      .sort(byCreation)[0] ?? null;
  const walk = (
    current: SplitRecord,
    seen: readonly string[],
  ): SplitRecord[] => {
    const following = next(current);
    return following && !seen.includes(following.id)
      ? [current, ...walk(following, [...seen, following.id])]
      : [current];
  };
  const result = walk(first, [first.id]);
  return result;
}

export const toSplit = (record: SplitRecord): EffectiveSplit => ({
  recordId: record.id,
  dayId: record.dayId,
  kind: record.kind,
  stance: record.payload.stance,
  arrivedCents: record.payload.arrivedCents,
  freeToSpendCents: record.payload.freeToSpendCents,
  lines: record.payload.lines,
});

/** The latest correction no later correction supersedes, else the confirmed record; null before the day is confirmed. */
export function getEffectiveSplit(
  records: readonly OpenRecord[],
): EffectiveSplit | null {
  const chain = getRecordChain(records);
  const result = chain.length === 0 ? null : toSplit(chain[chain.length - 1]);
  return result;
}

/** The effective split of every day the records cover, so balances read one split per day. */
export function getEffectiveSplits(
  records: readonly OpenRecord[],
): EffectiveSplit[] {
  const byDay = records.reduce<Map<string, OpenRecord[]>>((acc, record) => {
    acc.set(record.dayId, [...(acc.get(record.dayId) ?? []), record]);
    return acc;
  }, new Map());
  const result = [...byDay.values()].flatMap((group) => {
    const split = getEffectiveSplit(group);
    return split ? [split] : [];
  });
  return result;
}

export interface CorrectionInput {
  base: EffectiveSplit;
  arrivedCents: Cents;
  /** The amounts the person gave lines in place of the current ones, by line id. */
  edits: Readonly<Record<string, Cents>>;
  note: string | null;
}

/** The lines a correction changes, each with its amount before and after. */
export function getCorrectionChanges(
  before: readonly RecordLine[],
  after: readonly RecordLine[],
): CorrectionChange[] {
  const was = new Map(before.map((line) => [line.lineId, line.cents]));
  const result = after
    .filter((line) => (was.get(line.lineId) ?? 0) !== line.cents)
    .map((line): CorrectionChange => ({
      lineId: line.lineId,
      itemId: line.itemId,
      name: line.name,
      emoji: line.emoji,
      beforeCents: was.get(line.lineId) ?? 0,
      afterCents: line.cents,
    }));
  return result;
}

/** The split a correction puts in place of the current one. Free to Spend is what the money leaves after the lines, so everything still adds up to the amount that arrived. */
export function buildCorrection(input: CorrectionInput): CorrectionSealed {
  const { base, arrivedCents } = input;
  const lines = applyLineEdits(base.lines, input.edits, base.dayId);
  const result: CorrectionSealed = {
    stance: base.stance,
    arrivedCents,
    freeToSpendCents: getRemainder(arrivedCents, lines),
    lines,
    before: {
      arrivedCents: base.arrivedCents,
      freeToSpendCents: base.freeToSpendCents,
    },
    changes: getCorrectionChanges(base.lines, lines),
    note: input.note,
  };
  return result;
}

/** What a day's split already covers from Free to Spend: how far below nothing it leaves the day, which the person chose when it was confirmed or corrected. */
export function getDayCover(split: { freeToSpendCents: Cents }): Cents {
  const result = Math.max(0, -split.freeToSpendCents);
  return result;
}

/** How far a correction leaves its day short beyond the cover it already had: the gap the person is asked to cover from Free to Spend or take from the items. */
export function getCorrectionGap(
  base: { freeToSpendCents: Cents },
  correctedFreeCents: Cents,
): Cents {
  const result = Math.max(0, -correctedFreeCents - getDayCover(base));
  return result;
}

/** What Free to Spend can give a correction's cover: Free to Spend now, less what the day left that the correction takes back. Null when Free to Spend is unknown. */
export function getFreeForCorrection(
  freeCents: Cents | null,
  base: { freeToSpendCents: Cents },
): Cents | null {
  if (freeCents === null) return null;
  const result = freeCents - Math.max(0, base.freeToSpendCents);
  return result;
}

/** The most a corrected day may leave below nothing: the cover it had plus what the person chose to add from Free to Spend now. */
export function getCorrectionCover(
  base: { freeToSpendCents: Cents },
  addedCoverCents: Cents,
): Cents {
  const result = getDayCover(base) + Math.max(0, addedCoverCents);
  return result;
}

/** The id a correction of a record gets. A second correction of the same record is the same id, so it cannot be written twice. */
export const getCorrectionId = (supersedesId: string) =>
  `${supersedesId}_corrected`;

/** The checklist ticks that still stand after a correction: a line whose amount changed is unticked, since what is owed changed. */
export function keepTicks(
  doneLineIds: readonly string[],
  changes: readonly CorrectionChange[],
): string[] {
  const changed = new Set(changes.map((change) => change.lineId));
  const result = doneLineIds.filter((id) => !changed.has(id));
  return result;
}
