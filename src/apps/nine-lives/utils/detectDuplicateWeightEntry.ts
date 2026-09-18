import type { IngestionWeightProposal } from '../lib/extractProposalFromFile.types';
import type { WeightEntry } from '../types';

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function pounds(weight: number, unit: 'lb' | 'kg'): number {
  return unit === 'kg' ? weight * 2.20462 : weight;
}

export function detectDuplicateWeightEntry(
  proposal: IngestionWeightProposal,
  catId: string | null,
  entries: WeightEntry[],
): boolean {
  if (!catId) {
    return false;
  }

  const proposedPounds = pounds(proposal.weight, proposal.unit);
  return entries.some(
    (entry) =>
      entry.catId === catId &&
      Math.abs(entry.measuredAt - proposal.measuredAt) <= DUPLICATE_WINDOW_MS &&
      Math.abs(pounds(entry.weight, entry.unit) - proposedPounds) <= Math.max(0.1, proposedPounds * 0.01),
  );
}
