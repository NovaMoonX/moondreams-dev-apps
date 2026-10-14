import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import MacroStats from '@/components/MacroStats';
import { useAppSelector } from '@/store';
import {
  selectDefaultProducts,
  selectShowNutrition,
  selectStoresById,
  selectUsedIngredientIds,
} from '@apps/pinch/store/selectors';
import type { NutritionSwitches, ResolvedIngredient } from '@apps/pinch/types';
import {
  getServingGrams,
  scaleNutrition,
  type NutritionBasis,
} from '@apps/pinch/utils/nutritionBasis';
import { hasShownValue } from '@apps/pinch/utils/nutritionMath';
import {
  formatPriceAndSize,
  formatSize,
} from '@apps/pinch/utils/productFormat';

const getRowNutrition = (
  ingredient: ResolvedIngredient,
  basis: NutritionBasis,
  show: NutritionSwitches,
) => {
  if (!hasShownValue(ingredient.per100g, show)) {
    return null;
  }

  const servingGrams =
    basis === 'SERVING'
      ? getServingGrams(ingredient.serving, ingredient)
      : null;
  if (servingGrams === null) {
    return { values: ingredient.per100g, label: 'per 100 g' };
  }

  return {
    values: scaleNutrition(ingredient.per100g, servingGrams / 100),
    label: `per serving (${formatSize(ingredient.serving.amount, ingredient.serving.unit)})`,
  };
};

interface IngredientRowProps {
  ingredient: ResolvedIngredient;
  showPrices: boolean;
  showMacros: boolean;
  basis: NutritionBasis;
  onOpen: (id: string) => void;
}

function IngredientRow({
  ingredient,
  showPrices,
  showMacros,
  basis,
  onOpen,
}: IngredientRowProps) {
  const defaultProduct = useAppSelector((state) =>
    selectDefaultProducts(state).get(ingredient.id),
  );
  const show = useAppSelector(selectShowNutrition);
  const isUsedWithoutPrice = useAppSelector(
    (state) =>
      !selectDefaultProducts(state).has(ingredient.id) &&
      selectUsedIngredientIds(state).has(ingredient.id),
  );
  const storeName =
    useAppSelector(
      (state) =>
        selectStoresById(state).get(defaultProduct?.storeId ?? '')?.name,
    ) ?? 'Removed store';

  const getPriceLine = () => {
    if (!showPrices) return null;
    if (defaultProduct)
      return `${storeName} · ${formatPriceAndSize(defaultProduct)}`;
    return isUsedWithoutPrice ? 'No price yet' : null;
  };
  const priceLine = getPriceLine();
  const nutrition = showMacros
    ? getRowNutrition(ingredient, basis, show)
    : null;

  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={() => onOpen(ingredient.id)}
      className='h-auto w-full items-start justify-start gap-3 px-0! py-2.5 text-left'
    >
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block truncate font-medium'>
          {ingredient.name}
        </span>
        {priceLine && (
          <span className='text-muted-foreground block truncate text-xs font-normal'>
            {priceLine}
          </span>
        )}
        {nutrition && (
          <span className='text-muted-foreground block text-xs font-normal'>
            <MacroStats values={nutrition.values} show={show} />{' '}
            <span className='whitespace-nowrap'>{nutrition.label}</span>
          </span>
        )}
      </span>
      <ChevronRight
        className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default IngredientRow;
