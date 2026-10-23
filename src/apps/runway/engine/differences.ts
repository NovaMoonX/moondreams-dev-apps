import { PRIORITIES } from '@apps/runway/constants';
import type { Cents, RecordDifference, RecordLine } from '@apps/runway/types';

import { allocate } from './money';

/** What a day's lines take in all. */
export function sumLines(lines: readonly RecordLine[]): Cents {
  const result = lines.reduce((sum, line) => sum + line.cents, 0);
  return result;
}

/** What is left of the money that arrived once the lines have taken theirs. Free to spend is always this remainder, so lines and Free to spend add up to the amount to the cent. */
export function getRemainder(
  arrivedCents: Cents,
  lines: readonly RecordLine[],
): Cents {
  const result = arrivedCents - sumLines(lines);
  return result;
}

/** A line given a new amount: it is short by whatever it still lacks, and the days that paid for it are shared out again in the same proportions. */
function setLineCents(
  line: RecordLine,
  cents: Cents,
  dayId: string,
): RecordLine {
  if (cents === line.cents) return line;
  const weights = line.paidBy.map((paid) => paid.cents);
  const shares =
    weights.reduce((sum, weight) => sum + weight, 0) > 0
      ? allocate(
          cents,
          weights,
          line.paidBy.map((paid) => paid.dayId),
        )
      : [];
  const paidBy =
    shares.length > 0
      ? line.paidBy
          .map((paid, index) => ({ dayId: paid.dayId, cents: shares[index] }))
          .filter((paid) => paid.cents > 0)
      : cents > 0
        ? [{ dayId, cents }]
        : [];
  const result: RecordLine = {
    ...line,
    cents,
    shortBy: Math.max(0, line.demandCents - cents),
    paidBy,
  };
  return result;
}

/** The lines with the person's amounts in place of the draft's, keyed by line id. */
export function applyLineEdits(
  lines: readonly RecordLine[],
  edits: Readonly<Record<string, Cents>>,
  dayId: string,
): RecordLine[] {
  const result = lines.map((line) =>
    Object.hasOwn(edits, line.lineId)
      ? setLineCents(line, edits[line.lineId], dayId)
      : line,
  );
  return result;
}

const tierRank = (tier: RecordLine['tier']) => PRIORITIES.indexOf(tier);

/**
 * New amounts that take `needCents` out of the lines, lowest priority first and the later line of a
 * tier before the earlier one, never taking a line below zero. The person can change any of it.
 */
export function suggestShortfall(
  lines: readonly RecordLine[],
  needCents: Cents,
): Record<string, Cents> {
  if (needCents <= 0) return {};
  const order = lines
    .map((line, index) => ({ line, index }))
    .sort(
      (a, b) =>
        tierRank(b.line.tier) - tierRank(a.line.tier) || b.index - a.index,
    );
  const { edits } = order.reduce<{
    edits: Record<string, Cents>;
    left: Cents;
  }>(
    (acc, { line }) => {
      if (acc.left <= 0 || line.cents <= 0) return acc;
      const take = Math.min(line.cents, acc.left);
      return {
        edits: { ...acc.edits, [line.lineId]: line.cents - take },
        left: acc.left - take,
      };
    },
    { edits: {}, left: needCents },
  );
  return edits;
}

/** The lines that are not what the draft proposed, each with the person's note when there is one. A line the draft did not have counts as planned at nothing. */
export function getLineDifferences(
  proposed: readonly RecordLine[],
  confirmed: readonly RecordLine[],
  notes: Readonly<Record<string, string | null>>,
): RecordDifference[] {
  const planned = new Map(proposed.map((line) => [line.lineId, line.cents]));
  const result = confirmed
    .filter((line) => (planned.get(line.lineId) ?? 0) !== line.cents)
    .map((line): RecordDifference => ({
      kind: 'line',
      lineId: line.lineId,
      itemId: line.itemId,
      name: line.name,
      plannedCents: planned.get(line.lineId) ?? 0,
      actualCents: line.cents,
      note: Object.hasOwn(notes, line.lineId) ? notes[line.lineId] : null,
    }));
  return result;
}
