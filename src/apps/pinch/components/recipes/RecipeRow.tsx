import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import { useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import CoverImage from '@apps/pinch/components/shared/CoverImage';
import NutritionLine from '@apps/pinch/components/shared/NutritionLine';
import {
  selectRecipeNutrition,
  selectShowNutrition,
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
  onOpen: (id: string) => void;
}

function RecipeRow({ recipe, cost, onOpen }: RecipeRowProps) {
  const nutrition = useAppSelector(selectRecipeNutrition).get(recipe.id);
  const show = useAppSelector(selectShowNutrition);
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
      className='h-auto min-h-16 w-full justify-start gap-3 px-0! py-2 text-left'
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
        <span className='text-muted-foreground block truncate text-xs font-normal'>
          {detail}
        </span>
        {cost?.perServingCents != null && (
          <span className='text-muted-foreground block text-xs font-normal'>
            <span className='whitespace-nowrap'>
              {formatCents(Math.round(cost.perServingCents))} / serving
            </span>
            {leftOutCount > 0 && ` · leaves out ${leftOutCount}`}
          </span>
        )}
        {nutrition && hasShownValue(nutrition.values, show) && (
          <span className='text-muted-foreground block truncate text-xs font-normal'>
            <NutritionLine values={nutrition.values} show={show} /> per serving
          </span>
        )}
      </span>
      <ChevronRight
        className='text-muted-foreground h-5 w-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default RecipeRow;
