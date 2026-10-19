import { memo } from 'react';
import { shallowEqual } from 'react-redux';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import MacroStats from '@/components/MacroStats';
import StarButton from '@/components/StarButton';
import { useAppSelector } from '@/store';
import StockLine from '@apps/pinch/components/containers/StockLine';
import CoverImage from '@apps/pinch/components/shared/CoverImage';
import {
  selectRecipeNutrition,
  selectShowNutrition,
  selectStockByRecipe,
} from '@apps/pinch/store/selectors';
import type { Recipe, RecipeCost } from '@apps/pinch/types';
import { isStarred } from '@apps/pinch/utils/favorites';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import { formatRowPrice } from '@apps/pinch/utils/mealFormat';
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
  onToggleFavorite: (recipe: Recipe) => void;
  /** Pick-several mode: the row carries a tick and a tap ticks it instead of opening the recipe. */
  isSelecting?: boolean;
  isSelected?: boolean;
  onToggle?: (id: string) => void;
}

function RecipeRow({
  recipe,
  cost,
  showPrices,
  showMacros,
  showStock,
  onOpen,
  onToggleFavorite,
  isSelecting = false,
  isSelected = false,
  onToggle,
}: RecipeRowProps) {
  const nutrition = useAppSelector(selectRecipeNutrition).get(recipe.id);
  const show = useAppSelector(selectShowNutrition);
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

  const cover = (
    <CoverImage
      coverPath={recipe.coverPath ?? null}
      coverUrl={recipe.coverUrl ?? null}
      version={recipe.updatedAt}
      size={56}
    />
  );
  const text = (
    <span className='min-w-0 flex-1'>
      <span
        className={join(
          'text-foreground block truncate font-medium',
          !isSelecting && 'pr-9',
        )}
      >
        {recipe.title}
      </span>
      <span className='text-muted-foreground block truncate text-xs font-normal'>
        {detail}
      </span>
      {showPrices && cost?.perServingCents != null && (
        <span className='text-muted-foreground block text-xs font-normal whitespace-nowrap'>
          {formatRowPrice(cost.perServingCents, leftOutCount > 0)} per serving
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
  );

  if (isSelecting) {
    return (
      <label className='flex w-full cursor-pointer items-start gap-3 py-2 select-none'>
        <span className='mt-4 inline-flex shrink-0'>
          <Checkbox
            aria-label={`${recipe.title}, ${detail}`}
            checked={isSelected}
            onCheckedChange={() => onToggle?.(recipe.id)}
          />
        </span>
        {cover}
        {text}
      </label>
    );
  }

  return (
    <div className='relative'>
      <Button
        type='button'
        variant='tertiary'
        onClick={() => onOpen(recipe.id)}
        className='h-auto w-full items-start justify-start gap-3 px-0! py-2 text-left'
      >
        {cover}
        {text}
        <ChevronRight
          className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
          aria-hidden='true'
        />
      </Button>
      <StarButton
        isOn={isStarred(recipe)}
        label={`Favorite ${recipe.title}`}
        onClassName='text-[var(--pinch-drizzle)]'
        className='absolute top-0 right-7'
        onClick={() => onToggleFavorite(recipe)}
      />
    </div>
  );
}

export default memo(RecipeRow);
