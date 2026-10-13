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
import type { ResolvedIngredient } from '@apps/pinch/types';
import { formatPriceAndSize } from '@apps/pinch/utils/productFormat';
import { hasShownValue } from '@apps/pinch/utils/nutritionMath';

interface IngredientRowProps {
  ingredient: ResolvedIngredient;
  onOpen: (id: string) => void;
}

function IngredientRow({ ingredient, onOpen }: IngredientRowProps) {
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

  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={() => onOpen(ingredient.id)}
      className='h-auto min-h-14 w-full justify-start gap-3 px-0! py-2 text-left'
    >
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block truncate font-medium'>
          {ingredient.name}
        </span>
        {defaultProduct ? (
          <span className='text-muted-foreground block truncate text-xs font-normal'>
            {storeName} · {formatPriceAndSize(defaultProduct)}
          </span>
        ) : isUsedWithoutPrice ? (
          <span className='text-muted-foreground block truncate text-xs font-normal'>
            No price yet
          </span>
        ) : (
          hasShownValue(ingredient.per100g, show) && (
            <span className='text-muted-foreground block text-xs font-normal'>
              <MacroStats values={ingredient.per100g} show={show} /> per 100 g
            </span>
          )
        )}
      </span>
      <ChevronRight
        className='text-muted-foreground h-5 w-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default IngredientRow;
