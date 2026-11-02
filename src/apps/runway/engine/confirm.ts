import type {
  Cents,
  ConfirmedSealed,
  OpenRecord,
  ProposedSealed,
  RecordLine,
  Stance,
} from '@apps/runway/types';

import { getEffectiveSplits } from './correct';
import type { Draft } from './draft';
import { getPartName } from './parts';
import {
  applyLineEdits,
  getLineDifferences,
  getRemainder,
} from './differences';

export interface ItemNames {
  [itemId: string]: { name: string; emoji: string | null };
}

/** Lines of a draft as a record keeps them, with the names they had that day. */
export function toRecordLines(draft: Draft, names: ItemNames): RecordLine[] {
  const result = draft.lines.map((line): RecordLine => ({
    lineId: line.lineId,
    itemId: line.itemId,
    part: line.part,
    name: getPartName(
      Object.hasOwn(names, line.itemId) ? names[line.itemId].name : '',
      line,
      draft.lines,
    ),
    emoji: Object.hasOwn(names, line.itemId) ? names[line.itemId].emoji : null,
    tier: line.tier,
    demandCents: line.demandCents,
    cents: line.cents,
    shortBy: line.shortBy,
    paidBy: line.paidBy.map(({ dayKey, cents }) => ({
      dayId: dayKey,
      cents,
    })),
  }));
  return result;
}

/** Bill lines due before the next income day (any bill when no next day is known): a shortfall reaches them last. */
export function getProtectedLineIds(
  draft: Draft,
  nextDayOn: number | null,
): Set<string> {
  const result = new Set(
    draft.lines
      .filter(
        (line) =>
          line.bill !== null &&
          (nextDayOn === null || line.bill.dueOn < nextDayOn),
      )
      .map((line) => line.lineId),
  );
  return result;
}

/** Lines whose pairing is still waiting for the person's choice. */
export function countUnresolvedHolds(draft: Draft): number {
  const result = draft.lines.filter(
    (line) => line.pairing?.state === 'held',
  ).length;
  return result;
}

/** What Free to Spend holds once the money that arrived replaces the money expected. */
export function getFreeAfterArrival(draft: Draft, arrivedCents: Cents): Cents {
  const result = draft.freeToSpend.cents + (arrivedCents - draft.moneyCents);
  return result;
}

export interface BuildRecordsInput {
  draft: Draft;
  names: ItemNames;
  stance: Stance;
  fingerprint: string;
  arrivedCents: Cents;
  /** The note on the amount that differs. */
  note: string | null;
  /** The amounts the person gave lines in place of the draft's, by line id. */
  edits?: Readonly<Record<string, Cents>>;
  /** The notes on changed lines, by line id. */
  lineNotes?: Readonly<Record<string, string | null>>;
}

/**
 * The two records a confirmed day keeps. The confirmed lines are the proposed ones with the person's
 * amounts in place; Free to Spend is what the money leaves after them, so everything adds up to the
 * amount that arrived. The amount and each changed line are recorded as differences.
 */
export function buildRecords(input: BuildRecordsInput): {
  proposed: ProposedSealed;
  confirmed: ConfirmedSealed;
} {
  const { draft, arrivedCents } = input;
  const lines = toRecordLines(draft, input.names);
  const dayId = draft.days[0]?.dayKey ?? '';
  const confirmedLines = applyLineEdits(lines, input.edits ?? {}, dayId);
  const proposed: ProposedSealed = {
    fingerprint: input.fingerprint,
    stance: input.stance,
    expectedCents: draft.moneyCents,
    freeToSpendCents: draft.freeToSpend.cents,
    lines,
  };
  const confirmed: ConfirmedSealed = {
    fingerprint: input.fingerprint,
    stance: input.stance,
    arrivedCents,
    expectedCents: draft.moneyCents,
    freeToSpendCents: getRemainder(arrivedCents, confirmedLines),
    lines: confirmedLines,
    differences: [
      ...(arrivedCents === draft.moneyCents
        ? []
        : [
            {
              kind: 'amount' as const,
              plannedCents: draft.moneyCents,
              actualCents: arrivedCents,
              note: input.note,
            },
          ]),
      ...getLineDifferences(lines, confirmedLines, input.lineNotes ?? {}),
    ],
  };
  return { proposed, confirmed };
}

/** What each plan item has been given by confirmed days, from the records read so far; a corrected day counts its latest correction, never the original. */
export function sumConfirmedByItem(
  records: readonly OpenRecord[],
): Record<string, Cents> {
  const result = getEffectiveSplits(records)
    .flatMap((split) => split.lines)
    .reduce<Record<string, Cents>>((sums, line) => {
      sums[line.itemId] = (sums[line.itemId] ?? 0) + line.cents;
      return sums;
    }, {});
  return result;
}
