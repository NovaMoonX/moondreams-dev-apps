import { createOptionMatcher } from '@/utils/optionMatchUtils';
import type { Cat } from '../types';

const catMatcher = createOptionMatcher<Cat>({
  names: (cat) => [cat.name],
  reorder: false,
  typos: 'loose',
});

export function matchExistingCat(name: string | null | undefined, cats: Cat[]): string | null {
  return catMatcher.match(name ?? '', cats)?.id ?? null;
}
