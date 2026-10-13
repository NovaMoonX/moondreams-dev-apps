import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import MealChip from '@apps/pinch/components/calendar/MealChip';
import { MEAL_TYPE_LABELS } from '@apps/pinch/constants';
import { selectCostContext } from '@apps/pinch/store/selectors';
import type { PlannedMeal } from '@apps/pinch/types';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import { getPlannedMealCost } from '@apps/pinch/utils/mealMath';

interface MealRowProps {
  meal: PlannedMeal;
  title: string;
  subtitle: string | null;
  onOpen: () => void;
}

/** One planned meal as a tappable row: its emoji chip, what is on the plate, its type and what it cost. */
function MealRow({ meal, title, subtitle, onOpen }: MealRowProps) {
  const costContext = useAppSelector(selectCostContext);
  const { totalCents } = getPlannedMealCost(meal, costContext);
  const typeLabel = MEAL_TYPE_LABELS[meal.mealType];

  return (
    <Button
      type='button'
      variant='tertiary'
      aria-label={`Open ${typeLabel.toLowerCase()}: ${title}`}
      onClick={onOpen}
      className='h-auto w-full justify-start gap-3 px-0! py-2 text-left font-normal'
    >
      <MealChip
        mealType={meal.mealType}
        className='size-10 rounded-xl text-xl'
      />
      <span className='min-w-0 flex-1'>
        <span className='text-foreground line-clamp-2 block text-sm font-medium break-words whitespace-normal'>
          {title}
        </span>
        {subtitle && (
          <span className='text-muted-foreground block text-xs'>
            {subtitle}
          </span>
        )}
      </span>
      {totalCents !== null && (
        <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
          {formatCost(totalCents)}
        </span>
      )}
    </Button>
  );
}

export default MealRow;
