import type {
  Cents,
  ConfirmedSealed,
  OpenRecord,
  ProposedSealed,
  RecordLine,
  Stance,
} from '@apps/runway/types';

import type { Draft } from './draft';

export interface ItemNames {
  [itemId: string]: { name: string; emoji: string | null };
}

/** Lines of a draft as a record keeps them, with the names they had that day. */
export function toRecordLines(draft: Draft, names: ItemNames): RecordLine[] {
  const result = draft.lines.map((line): RecordLine => ({
    lineId: line.lineId,
    itemId: line.itemId,
    name: Object.hasOwn(names, line.itemId) ? names[line.itemId].name : '',
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

/** Lines whose pairing is still waiting for the person's choice. */
export function countUnresolvedHolds(draft: Draft): number {
  const result = draft.lines.filter(
    (line) => line.pairing?.state === 'held',
  ).length;
  return result;
}

/** The least the money can be and still pay every line the draft funds. */
export function getLeastArrival(draft: Draft): Cents {
  const result = draft.moneyCents - draft.freeToSpend.cents;
  return result;
}

/** What Free to spend holds once the money that arrived replaces the money expected. */
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
  note: string | null;
}

/**
 * The two records a confirmed day keeps. Until lines can be edited at confirmation, the confirmed lines
 * are the proposed ones and only the amount can differ; the difference goes to Free to spend.
 */
export function buildRecords(input: BuildRecordsInput): {
  proposed: ProposedSealed;
  confirmed: ConfirmedSealed;
} {
  const { draft, arrivedCents } = input;
  const lines = toRecordLines(draft, input.names);
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
    freeToSpendCents: getFreeAfterArrival(draft, arrivedCents),
    lines,
    differences:
      arrivedCents === draft.moneyCents
        ? []
        : [
            {
              kind: 'amount',
              plannedCents: draft.moneyCents,
              actualCents: arrivedCents,
              note: input.note,
            },
          ],
  };
  return { proposed, confirmed };
}

/** What each plan item has been given by confirmed days, from the records read so far. */
export function sumConfirmedByItem(
  records: readonly OpenRecord[],
): Record<string, Cents> {
  const result = records.reduce<Record<string, Cents>>((acc, record) => {
    if (record.kind !== 'confirmed') return acc;
    return record.payload.lines.reduce(
      (sums, line) => ({
        ...sums,
        [line.itemId]: (sums[line.itemId] ?? 0) + line.cents,
      }),
      acc,
    );
  }, {});
  return result;
}
