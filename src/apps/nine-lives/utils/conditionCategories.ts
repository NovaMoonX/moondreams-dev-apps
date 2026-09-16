import type { ConditionCategory } from '../types';

export const CONDITION_CATEGORIES: ConditionCategory[] = [
  'illness',
  'injury',
  'chronic',
  'parasite',
  'allergy',
];

export function getConditionCategoryLabel(category: ConditionCategory): string {
  const labels: Record<ConditionCategory, string> = {
    illness: 'Illness',
    injury: 'Injury',
    chronic: 'Chronic',
    parasite: 'Parasite',
    allergy: 'Allergy',
  };

  return labels[category];
}
