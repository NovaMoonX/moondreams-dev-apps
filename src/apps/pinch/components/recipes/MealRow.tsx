import { memo, useMemo } from 'react';
import { shallowEqual } from 'react-redux';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import MacroStats from '@/components/MacroStats';
import StarButton from '@/components/StarButton';
import { useAppSelector } from '@/store';
import StockLine from '@apps/pinch/components/containers/StockLine';
import {
  selectCostContext,
  selectIngredientsById,
  selectRecipesById,
  selectShowNutrition,
  selectStockByMealWithRecipes,
} from '@apps/pinch/store/selectors';
import type { Meal } from '@apps/pinch/types';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import { isStarred } from '@apps/pinch/utils/favorites';
import { formatRowPrice, getItemTitle } from '@apps/pinch/utils/mealFormat';
import { getMealCost } from '@apps/pinch/utils/mealMath';
import {
  getMealNutrition,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';

interface MealRowProps {
  meal: Meal;
  showPrices: boolean;
  showMacros: boolean;
  showStock: boolean;
  onOpen: (id: string) => void;
  onToggleFavorite: (meal: Meal) => void;
}

function MealRow({
  meal,
  showPrices,
  showMacros,
  showStock,
  onOpen,
  onToggleFavorite,
}: MealRowProps) {
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const costContext = useAppSelector(selectCostContext);
  const cost = useMemo(
    () => getMealCost(meal.items, costContext),
    [meal.items, costContext],
  );
  const show = useAppSelector(selectShowNutrition);
  const stock = useAppSelector((state) => {
    const found = showStock
      ? selectStockByMealWithRecipes(state).get(meal.id)
      : undefined;
    return (
      found && {
        fridge: found.fridge,
        freezer: found.freezer,
        fridgeEatBy: found.fridgeEatBy,
        freezerEatBy: found.freezerEatBy,
      }
    );
  }, shallowEqual);
  const nutrition = showMacros
    ? getMealNutrition(
        meal.items,
        costContext.recipeNutrition,
        costContext.ingredientsById,
      )
    : null;
  const leftOutCount = countLeftOutIngredients(cost.leftOut);
  const detail = [
    `${meal.items.length} ${meal.items.length === 1 ? 'item' : 'items'}`,
    showPrices &&
      (cost.totalCents === null
        ? 'No price yet'
        : formatRowPrice(cost.totalCents, leftOutCount > 0)),
  ]
    .filter(Boolean)
    .join(' · ');
  const itemNames = meal.items
    .map((item) => getItemTitle(item, recipesById, ingredientsById))
    .join(', ');

  return (
    <div className='relative'>
      <Button
        type='button'
        variant='tertiary'
        onClick={() => onOpen(meal.id)}
        className='h-auto w-full items-start justify-start gap-3 px-0! py-2 text-left'
      >
        <span
          className='bg-accent text-accent-foreground flex size-14 shrink-0 items-center justify-center rounded-xl text-2xl'
          aria-hidden='true'
        >
          🍽️
        </span>
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block truncate pr-9 font-medium'>
            {meal.name}
          </span>
          <span className='text-muted-foreground block truncate text-xs font-normal'>
            {detail}
          </span>
          {nutrition && hasShownValue(nutrition.values, show) && (
            <MacroStats
              values={nutrition.values}
              show={show}
              className='text-muted-foreground mt-0.5 text-xs font-normal'
            />
          )}
          <StockLine summary={stock} kind='meal' />
          <span className='text-muted-foreground block truncate text-xs font-normal'>
            {itemNames}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
          aria-hidden='true'
        />
      </Button>
      <StarButton
        isOn={isStarred(meal)}
        label={`Favorite ${meal.name}`}
        onClassName='text-[var(--pinch-drizzle)]'
        className='absolute top-0 right-7'
        onClick={() => onToggleFavorite(meal)}
      />
    </div>
  );
}

export default memo(MealRow);
