import type { Cat } from '../types';
import { getWordSimilarity, normalizeString } from '@/utils/stringUtils';

const MATCH_THRESHOLD = 0.82;

export function matchExistingCat(name: string | null | undefined, cats: Cat[]): string | null {
  const normalizedName = normalizeString(name ?? '');
  if (!normalizedName) {
    return null;
  }

  const candidates = cats
    .map((cat) => ({ cat, score: getWordSimilarity(normalizedName, normalizeString(cat.name)) }))
    .filter(({ score }) => score >= MATCH_THRESHOLD)
    .sort((left, right) => right.score - left.score);

  return candidates.length > 0 && (candidates.length === 1 || candidates[0].score > candidates[1].score)
    ? candidates[0].cat.id
    : null;
}
