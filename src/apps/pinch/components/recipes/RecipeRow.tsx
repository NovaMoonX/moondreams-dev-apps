import { memo } from 'react';
import { shallowEqual } from 'react-redux';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import MacroStats from '@/components/MacroStats';
import { useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import StockLine from '@apps/pinch/components/containers/StockLine';
import CoverImage from '@apps/pinch/components/shared/CoverImage';
import {
  selectCookSummaries,
  selectRecipeNutrition,
  selectShowNutrition,
  selectStockByRecipe,
} from '@apps/pinch/store/selectors';
import type { Recipe, RecipeCost } from '@apps/pinch/types';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import { hasShownValue } from '@apps/pinch/utils/nutritionMath';
import {
  formatMinutes,
  formatServings,
  getTotalMinutes,
} from '@apps/pinch/utils/recipeFormat';

interface RecipeRowProps {
  recipe: Recipe;
  cost: RecipeCost | undefined;
  showPrices: boolean;
  showMacros: boolean;
  showStock: boolean;
  onOpen: (id: string) => void;
}

function RecipeRow({
  recipe,
  cost,
  showPrices,
  showMacros,
  showStock,
  onOpen,
}: RecipeRowProps) {
  const nutrition = useAppSelector(selectRecipeNutrition).get(recipe.id);
  const show = useAppSelector(selectShowNutrition);
  const cookCount = useAppSelector(
    (state) => selectCookSummaries(state).get(recipe.id)?.count ?? 0,
  );
  const stock = useAppSelector(
    (state) =>
      showStock ? selectStockByRecipe(state).get(recipe.id) : undefined,
    shallowEqual,
  );
  const total = getTotalMinutes(recipe);
  const detail = [
    formatServings(recipe.servings),
    total === null ? null : formatMinutes(total),
  ]
    .filter(Boolean)
    .join(' · ');

  const leftOutCount = cost ? countLeftOutIngredients(cost.leftOut) : 0;

  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={() => onOpen(recipe.id)}
      className='h-auto w-full items-start justify-start gap-3 px-0! py-2 text-left'
    >
      <CoverImage
        coverPath={recipe.coverPath ?? null}
        version={recipe.updatedAt}
        size={56}
      />
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block truncate font-medium'>
          {recipe.title}
        </span>
        <span className='text-muted-foreground flex text-xs font-normal'>
          <span className='min-w-0 truncate'>{detail}</span>
          {cookCount > 0 && (
            <span className='shrink-0 whitespace-nowrap'>
              {'\u00A0·\u00A0'}Cooked {cookCount}×
            </span>
          )}
        </span>
        {showPrices && cost?.perServingCents != null && (
          <span className='text-muted-foreground block text-xs font-normal'>
            <span className='whitespace-nowrap'>
              {formatCents(Math.round(cost.perServingCents))} / serving
            </span>
            {leftOutCount > 0 && ` · leaves out ${leftOutCount}`}
          </span>
        )}
        {showPrices && cost && cost.perServingCents == null && (
          <span className='text-muted-foreground block text-xs font-normal'>
            No price yet
          </span>
        )}
        {showMacros && nutrition && hasShownValue(nutrition.values, show) && (
          <MacroStats
            values={nutrition.values}
            show={show}
            className='text-muted-foreground mt-0.5 text-xs font-normal'
          />
        )}
        <StockLine summary={stock} />
      </span>
      <ChevronRight
        className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default memo(RecipeRow);
