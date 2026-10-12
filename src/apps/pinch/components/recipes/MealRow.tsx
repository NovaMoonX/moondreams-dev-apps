import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import type { Meal } from '@apps/pinch/types';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import type { MealCost } from '@apps/pinch/utils/mealMath';

interface MealRowProps {
  meal: Meal;
  cost: MealCost;
  onOpen: (id: string) => void;
}

function MealRow({ meal, cost, onOpen }: MealRowProps) {
  const detail = [
    `${meal.items.length} ${meal.items.length === 1 ? 'item' : 'items'}`,
    cost.totalCents === null ? null : formatCost(cost.totalCents),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={() => onOpen(meal.id)}
      className='h-auto min-h-14 w-full justify-start gap-3 px-0! py-2 text-left'
    >
      <span
        className='flex h-10 w-10 shrink-0 items-center justify-center text-2xl'
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
      </span>
      <ChevronRight
        className='text-muted-foreground h-5 w-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default MealRow;
