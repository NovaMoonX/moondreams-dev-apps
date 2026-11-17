import {
  GROUPING_CONFIDENCE,
  GROUPING_EVIDENCE,
  GROUPING_LIMITS,
  GROUPING_PARENT_KINDS,
  type GroupingConfidence,
  type GroupingEvidence,
  type GroupingParentKind,
} from '../../nomos/grouping.js';

export const MAX_RELATE_GROUPINGS = 6;
export const TITLE_CAP = 40;

export interface RelateAnswer {
  /** Codes of the things to group, each once. */
  sources: string[];
  /** The code of the project or topic they go under; null when there is none. */
  parent: string | null;
  parentKind: GroupingParentKind;
  proposedTitle: string | null;
  confidence: GroupingConfidence;
  evidence: GroupingEvidence[];
}

export interface NormalizedRelate {
  groupings: RelateAnswer[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const toText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const isOneOf = <Item extends string>(
  list: readonly Item[],
  value: unknown,
): value is Item => list.some((item) => item === value);

const toOrNull = (value: unknown) => {
  const text = toText(value);
  return text === '' || text.toLowerCase() === 'none' ? null : text;
};

/** The model's answer read from unknown: an entry with no sources or a kind or confidence outside the lists is dropped, and what is left is capped. Nothing here says the answer is right; code checks that. */
export function normalizeRelate(raw: unknown): NormalizedRelate {
  const groupings = toList(isRecord(raw) ? raw.groupings : null)
    .filter(isRecord)
    .flatMap((entry): RelateAnswer[] => {
      const sources = [
        ...new Set(toList(entry.sources).map(toText).filter(Boolean)),
      ].slice(0, GROUPING_LIMITS.maxSources);
      if (
        sources.length === 0 ||
        !isOneOf(GROUPING_PARENT_KINDS, entry.parentKind) ||
        !isOneOf(GROUPING_CONFIDENCE, entry.confidence)
      )
        return [];
      return [
        {
          sources,
          parent: toOrNull(entry.parent),
          parentKind: entry.parentKind,
          proposedTitle:
            toOrNull(entry.proposedTitle)?.slice(0, TITLE_CAP) ?? null,
          confidence: entry.confidence,
          evidence: [
            ...new Set(
              toList(entry.evidence).filter((item): item is GroupingEvidence =>
                isOneOf(GROUPING_EVIDENCE, item),
              ),
            ),
          ],
        },
      ];
    })
    .slice(0, MAX_RELATE_GROUPINGS);
  return { groupings };
}
