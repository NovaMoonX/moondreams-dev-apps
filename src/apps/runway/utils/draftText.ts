import { DRAFT_CADENCE_WORDS, DRAFT_WORDS } from '@apps/runway/constants';
import type { DraftLine } from '@apps/runway/engine/draft';

const joinNames = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? DRAFT_WORDS.unnamedSource)
    : `${names.slice(0, -1).join(', ')} ${DRAFT_WORDS.and} ${names[names.length - 1]}`;

/** Words a line's structured reason: "Every income day, funded from Northwind Studio". */
export function describeLineReason(
  line: DraftLine,
  sourceNames: Record<string, string>,
) {
  if (line.reason.code === 'poolExhausted') return DRAFT_WORDS.outOfMoney;
  const names = [
    ...new Set(
      line.paidBy.map((part) =>
        part.sourceId !== null && Object.hasOwn(sourceNames, part.sourceId)
          ? sourceNames[part.sourceId]
          : DRAFT_WORDS.unnamedSource,
      ),
    ),
  ];
  const result = `${DRAFT_CADENCE_WORDS[line.reason.cadence]}, ${DRAFT_WORDS.fundedFrom} ${joinNames(names)}`;
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
