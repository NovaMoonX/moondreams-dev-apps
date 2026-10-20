import { toDisplayCase } from '@/utils/optionMatchUtils';

export function normalizeCustomLabelCasing(label: string): string {
  return toDisplayCase(label);
}
