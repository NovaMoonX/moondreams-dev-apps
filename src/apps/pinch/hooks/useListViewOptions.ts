import { NUTRITION_BASIS_OPTIONS } from '@apps/pinch/constants';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import type { NutritionBasis } from '@apps/pinch/utils/nutritionBasis';

export interface ListViewOptions {
  showPrices: boolean;
  showMacros: boolean;
  /** What an ingredient row's numbers are per; recipe and meal rows ignore it. */
  basis: NutritionBasis;
}

export const DEFAULT_LIST_VIEW_OPTIONS: ListViewOptions = {
  showPrices: true,
  showMacros: true,
  basis: 'PER_100G',
};

const BASES: string[] = NUTRITION_BASIS_OPTIONS.map((option) => option.value);

const parseOptions = (stored: unknown): ListViewOptions | null => {
  if (typeof stored !== 'object' || stored === null) {
    return null;
  }

  const { showPrices, showMacros, basis } = stored as Record<string, unknown>;
  return {
    showPrices:
      typeof showPrices === 'boolean'
        ? showPrices
        : DEFAULT_LIST_VIEW_OPTIONS.showPrices,
    showMacros:
      typeof showMacros === 'boolean'
        ? showMacros
        : DEFAULT_LIST_VIEW_OPTIONS.showMacros,
    basis:
      typeof basis === 'string' && BASES.includes(basis)
        ? (basis as NutritionBasis)
        : DEFAULT_LIST_VIEW_OPTIONS.basis,
  };
};

/** How a list's rows look, remembered per person and per list in this browser. */
export function useListViewOptions(
  uid: string,
  list: 'recipes' | 'ingredients',
) {
  const [options, setOptions] = useLocalStorageState(
    `pinch:${uid}:view:${list}`,
    DEFAULT_LIST_VIEW_OPTIONS,
    parseOptions,
  );

  const customizedCount = [
    options.showPrices !== DEFAULT_LIST_VIEW_OPTIONS.showPrices,
    options.showMacros !== DEFAULT_LIST_VIEW_OPTIONS.showMacros,
    list === 'ingredients' && options.basis !== DEFAULT_LIST_VIEW_OPTIONS.basis,
  ].filter(Boolean).length;

  return {
    options,
    customizedCount,
    update: (patch: Partial<ListViewOptions>) =>
      setOptions({ ...options, ...patch }),
    reset: () => setOptions(DEFAULT_LIST_VIEW_OPTIONS),
  };
}
