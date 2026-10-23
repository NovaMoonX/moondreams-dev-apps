import { DRAFT_CADENCE_WORDS, DRAFT_WORDS } from '@apps/runway/constants';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { describeAmount } from '@apps/runway/utils/fundingText';
import type { DraftLine } from '@apps/runway/engine/draft';

const joinNames = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? DRAFT_WORDS.unnamedSource)
    : `${names.slice(0, -1).join(', ')} ${DRAFT_WORDS.and} ${names[names.length - 1]}`;

/** "10% of Main job" or "The rest"; null for an exact line, whose cadence says enough. */
export function describeLineAsk(
  line: DraftLine,
  sourceNames: Record<string, string>,
) {
  if (line.ask.kind === 'exact') return null;
  if (line.ask.kind === 'rest') return DRAFT_WORDS.restAsk;
  const source =
    line.sourceId !== null && Object.hasOwn(sourceNames, line.sourceId)
      ? sourceNames[line.sourceId]
      : DRAFT_WORDS.unnamedSource;
  const result = describeAmount(
    { kind: 'percent', bps: line.ask.bps, of: 'dayMoney' },
    source,
  );
  return result;
}

/** Words a line's structured reason: "Every income day, funded from Northwind Studio". */
export function describeLineReason(
  line: DraftLine,
  sourceNames: Record<string, string>,
) {
  if (line.reason.code === 'poolExhausted') return DRAFT_WORDS.outOfMoney;
  if (line.reason.code === 'nothingLeft') return DRAFT_WORDS.restEmpty;
  const names = [
    ...new Set(
      line.paidBy.map((part) =>
        part.sourceId !== null && Object.hasOwn(sourceNames, part.sourceId)
          ? sourceNames[part.sourceId]
          : DRAFT_WORDS.unnamedSource,
      ),
    ),
  ];
  const cadence = DRAFT_CADENCE_WORDS[line.reason.cadence];
  const ask = describeLineAsk(line, sourceNames);
  const funded = `${DRAFT_WORDS.fundedFrom} ${joinNames(names)}`;
  if (line.ask.kind === 'percent') {
    return `${ask}, ${cadence.toLowerCase()}`;
  }
  const result = `${ask ? `${ask}, ${cadence.toLowerCase()}` : cadence}, ${funded}`;
  return result;
}

/** A bill line's second sentence: "Due Dec 1 · $500.00 of $1,200.00". */
export function describeBillShare(line: DraftLine) {
  if (line.bill === null) return null;
  const result = `${DRAFT_WORDS.dueOn} ${formatDateUTC(line.bill.dueOn)} · ${formatCents(line.cents)} ${DRAFT_WORDS.setAsideOf} ${formatCents(line.bill.totalCents)}`;
  return result;
}

export function describeTieBreak(line: DraftLine) {
  if (line.tieBrokenBy === null) return null;
  const result =
    line.tieBrokenBy === 'createdAt'
      ? DRAFT_WORDS.tieCreatedAt
      : DRAFT_WORDS.tieItemId;
  return result;
}
