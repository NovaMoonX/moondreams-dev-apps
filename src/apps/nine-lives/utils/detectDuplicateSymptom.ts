import type { IngestionSymptomProposal } from '../lib/extractProposalFromFile.types';
import type { Symptom } from '../types';

export const SYMPTOM_DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeDescription(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function detectDuplicateSymptom(
  proposal: IngestionSymptomProposal,
  catId: string | null,
  symptoms: Symptom[],
): boolean {
  const description = normalizeDescription(proposal.description);
  if (!catId || !description) {
    return false;
  }

  return symptoms.some(
    (symptom) =>
      symptom.catId === catId &&
      Math.abs(symptom.firstNoticedAt - proposal.firstNoticedAt) <= SYMPTOM_DUPLICATE_WINDOW_MS &&
      normalizeDescription(symptom.description) === description,
  );
}
