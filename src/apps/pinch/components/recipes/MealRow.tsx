import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import { useAppSelector } from '@/store';
import {
  selectIngredientsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { Meal } from '@apps/pinch/types';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import { formatCost, getItemTitle } from '@apps/pinch/utils/mealFormat';
import type { MealCost } from '@apps/pinch/utils/mealMath';

interface MealRowProps {
  meal: Meal;
  cost: MealCost;
  onOpen: (id: string) => void;
}

function MealRow({ meal, cost, onOpen }: MealRowProps) {
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const leftOutCount = countLeftOutIngredients(cost.leftOut);
  const detail = [
    `${meal.items.length} ${meal.items.length === 1 ? 'item' : 'items'}`,
    cost.totalCents === null ? 'No price yet' : formatCost(cost.totalCents),
    cost.totalCents !== null && leftOutCount > 0
      ? `leaves out ${leftOutCount}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const itemNames = meal.items
    .map((item) => getItemTitle(item, recipesById, ingredientsById))
    .join(', ');

  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={() => onOpen(meal.id)}
      className='h-auto min-h-14 w-full justify-start gap-3 px-0! py-2 text-left'
    >
      <span
        className='bg-accent text-accent-foreground flex size-14 shrink-0 items-center justify-center rounded-xl text-2xl'
        aria-hidden='true'
      >
        🍽️
      </span>
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block truncate font-medium'>
          {meal.name}
        </span>
        <span className='text-muted-foreground block truncate text-xs font-normal'>
          {detail}
        </span>
        <span className='text-muted-foreground block truncate text-xs font-normal'>
          {itemNames}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground h-5 w-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default MealRow;
