import type { VetClinic } from '../types';
import { getWordSimilarity, normalizeString } from '@/utils/stringUtils';

const MATCH_THRESHOLD = 0.82;

export function matchExistingClinic(
  name: string | null | undefined,
  clinics: VetClinic[],
): string | null {
  const normalizedName = normalizeString(name ?? '');
  if (!normalizedName) {
    return null;
  }

  const candidates = clinics
    .map((clinic) => ({ clinic, score: getWordSimilarity(normalizedName, normalizeString(clinic.name)) }))
    .filter(({ score }) => score >= MATCH_THRESHOLD)
    .sort((left, right) => right.score - left.score);

  return candidates.length > 0 && (candidates.length === 1 || candidates[0].score > candidates[1].score)
    ? candidates[0].clinic.id
    : null;
}
