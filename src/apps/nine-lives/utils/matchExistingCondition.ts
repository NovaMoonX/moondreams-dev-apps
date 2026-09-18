import type { IngestionConditionProposal } from '../lib/extractProposalFromFile.types';
import type { CatCondition, LibraryCondition } from '../types';

const MATCH_THRESHOLD = 0.82;

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function similarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] =
        left[leftIndex - 1] === right[rightIndex - 1]
          ? previous[rightIndex - 1]
          : 1 + Math.min(previous[rightIndex], current[rightIndex - 1], previous[rightIndex - 1]);
    }
    previous.splice(0, previous.length, ...current);
  }

  return 1 - previous[right.length] / Math.max(left.length, right.length, 1);
}

function bestMatch<T extends { id: string; name: string }>(name: string, values: T[]): string | null {
  const normalizedName = normalizeName(name);
  const candidates = values
    .map((value) => ({ value, score: similarity(normalizedName, normalizeName(value.name)) }))
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

