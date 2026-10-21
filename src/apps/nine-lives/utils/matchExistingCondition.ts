import type { IngestionConditionProposal } from '../lib/extractProposalFromFile.types';
import type { CatCondition, LibraryCondition } from '../types';
import { createOptionMatcher } from '@/utils/optionMatchUtils';

const conditionMatcher = createOptionMatcher<{ id: string; name: string }>({
  names: (condition) => [condition.name],
  typos: 'loose',
});

function bestMatch<T extends { id: string; name: string }>(name: string, values: T[]): string | null {
  return conditionMatcher.match(name, values)?.id ?? null;
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
