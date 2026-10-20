import { NUTRITION_BASIS_OPTIONS } from '@apps/pinch/constants';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import type { NutritionBasis } from '@apps/pinch/utils/nutritionBasis';

export interface ListViewOptions {
  showPrices: boolean;
  showMacros: boolean;
  /** What an ingredient row's numbers are per; recipe and meal rows ignore it. */
  basis: NutritionBasis;
  /** The fridge and freezer line on recipe and meal rows; ingredient rows ignore it. */
  showStock: boolean;
  /** The Calendar's tile row of the period's total, averages and daily nutrition; the lists ignore it. Settings switches it, so it never counts as a customized view option. */
  showStats: boolean;
}

export const DEFAULT_LIST_VIEW_OPTIONS: ListViewOptions = {
  showPrices: true,
  showMacros: false,
  basis: 'PER_100G',
  showStock: true,
  showStats: false,
};

type ListViewList = 'recipes' | 'ingredients' | 'calendar';

const BASES: string[] = NUTRITION_BASIS_OPTIONS.map((option) => option.value);

export const parseListViewOptions = (
  stored: unknown,
): ListViewOptions | null => {
  if (typeof stored !== 'object' || stored === null) {
    return null;
  }

  const { showPrices, showMacros, basis, showStock, showStats } =
    stored as Record<string, unknown>;
  const options = {
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
    showStock:
      typeof showStock === 'boolean'
        ? showStock
        : DEFAULT_LIST_VIEW_OPTIONS.showStock,
    showStats:
      typeof showStats === 'boolean'
        ? showStats
        : DEFAULT_LIST_VIEW_OPTIONS.showStats,
  };
  return options;
};

export const countCustomizedViewOptions = (
  options: ListViewOptions,
  list: ListViewList,
) =>
  [
    options.showPrices !== DEFAULT_LIST_VIEW_OPTIONS.showPrices,
    list !== 'calendar' &&
      options.showMacros !== DEFAULT_LIST_VIEW_OPTIONS.showMacros,
    list === 'ingredients' && options.basis !== DEFAULT_LIST_VIEW_OPTIONS.basis,
    list === 'recipes' &&
      options.showStock !== DEFAULT_LIST_VIEW_OPTIONS.showStock,
  ].filter(Boolean).length;

/** How a list's rows look, remembered per person and per list in this browser. */
export function useListViewOptions(uid: string, list: ListViewList) {
  const [options, setOptions] = useLocalStorageState(
    `pinch:${uid}:view:${list}`,
    DEFAULT_LIST_VIEW_OPTIONS,
    parseListViewOptions,
  );

  const customizedCount = countCustomizedViewOptions(options, list);

  return {
    options,
    customizedCount,
    update: (patch: Partial<ListViewOptions>) =>
      setOptions({ ...options, ...patch }),
    reset: () => setOptions(DEFAULT_LIST_VIEW_OPTIONS),
  };
}
