import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import { useAppSelector } from '@/store';
import IngredientIcon from '@apps/pinch/components/shared/IngredientIcon';
import NutritionLine from '@apps/pinch/components/shared/NutritionLine';
import {
  selectDefaultProducts,
  selectStoresById,
} from '@apps/pinch/store/selectors';
import type { ResolvedIngredient } from '@apps/pinch/types';
import { formatPriceAndSize } from '@apps/pinch/utils/productFormat';
import { hasNutrition } from '@apps/pinch/utils/nutrition';

interface IngredientRowProps {
  ingredient: ResolvedIngredient;
  onOpen: (id: string) => void;
}

function IngredientRow({ ingredient, onOpen }: IngredientRowProps) {
  const defaultProduct = useAppSelector((state) =>
    selectDefaultProducts(state).get(ingredient.id),
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
      <IngredientIcon iconKey={ingredient.iconKey} size={32} />
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block truncate font-medium'>
          {ingredient.name}
        </span>
        {defaultProduct ? (
          <span className='text-muted-foreground block truncate text-xs font-normal'>
            {storeName} · {formatPriceAndSize(defaultProduct)}
          </span>
        ) : (
          hasNutrition(ingredient.per100g) && (
            <span className='text-muted-foreground block truncate text-xs font-normal'>
              <NutritionLine values={ingredient.per100g} isCompact /> per 100 g
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
