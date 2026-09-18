import type { IngestionConditionProposal } from '../lib/extractProposalFromFile.types';
import type { CatCondition, LibraryCondition } from '../types';
import { getWordSimilarity, normalizeString } from '@/utils/stringUtils';

const MATCH_THRESHOLD = 0.82;

function bestMatch<T extends { id: string; name: string }>(name: string, values: T[]): string | null {
  const normalizedName = normalizeString(name);
  const candidates = values
    .map((value) => ({ value, score: getWordSimilarity(normalizedName, normalizeString(value.name)) }))
    .filter(({ score }) => score >= MATCH_THRESHOLD)
    .sort((left, right) => right.score - left.score);

  return candidates.length > 0 && (candidates.length === 1 || candidates[0].score > candidates[1].score)
    ? candidates[0].value.id
    : null;
}

export function matchExistingCondition(
  proposal: IngestionConditionProposal,
  catId: string | null,
  libraryConditions: LibraryCondition[],
  catConditions: CatCondition[],
): { matchedLibraryConditionId: string | null; matchedCatConditionId: string | null } {
  const matchedLibraryConditionId = bestMatch(proposal.name, libraryConditions);
  const matchedCatConditionId = catId
    ? bestMatch(
        proposal.name,
        catConditions.filter(
          (condition) =>
            condition.catId === catId &&
            (condition.status === 'active' || condition.status === 'ongoing'),
        ),
      )
    : null;

  return { matchedLibraryConditionId, matchedCatConditionId };
}
