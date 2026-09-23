import { normalizeString } from '@/utils/stringUtils';

export function normalizeCustomLabelCasing(label: string): string {
  const normalized = normalizeString(label);
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : '';
}
