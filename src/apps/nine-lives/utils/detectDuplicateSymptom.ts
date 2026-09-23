import type { IngestionSymptomProposal } from '../lib/extractProposalFromFile.types';
import type { Symptom } from '../types';
import { normalizeString } from '@/utils/stringUtils';

export const SYMPTOM_DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function detectDuplicateSymptom(
  proposal: IngestionSymptomProposal,
  catId: string | null,
  symptoms: Symptom[],
): boolean {
  const description = normalizeString(proposal.description);
  if (!catId || !description) {
    return false;
  }

  return symptoms.some(
    (symptom) =>
      symptom.catId === catId &&
      Math.abs(symptom.firstNoticedAt - proposal.firstNoticedAt) <= SYMPTOM_DUPLICATE_WINDOW_MS &&
      normalizeString(symptom.description) === description,
  );
}
