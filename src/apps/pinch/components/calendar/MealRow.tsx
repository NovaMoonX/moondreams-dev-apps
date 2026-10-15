import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import MealChip from '@apps/pinch/components/calendar/MealChip';
import { MEAL_TYPE_LABELS } from '@apps/pinch/constants';
import {
  selectCooksById,
  selectCostContext,
} from '@apps/pinch/store/selectors';
import type { PlannedMeal } from '@apps/pinch/types';
import { getCookId } from '@apps/pinch/utils/cooks';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import { getPlannedMealCost } from '@apps/pinch/utils/mealMath';

interface MealRowProps {
  meal: PlannedMeal;
  title: string;
  subtitle: string | null;
  /** Today or a day already gone: the only days a meal can have been cooked on. */
  canBeCooked: boolean;
  /** A passed day says "Not priced" once, on its own tile, so its rows don't repeat it. */
  isPast: boolean;
  /** Whether the row says what the meal costs. */
  showPrice: boolean;
  onOpen: () => void;
}

/** One planned meal as a tappable row: its emoji chip, what is on the plate, its type, ✅ once cooked, and what it costs. */
function MealRow({
  meal,
  title,
  subtitle,
  canBeCooked,
  isPast,
  showPrice,
  onOpen,
}: MealRowProps) {
  const costContext = useAppSelector(selectCostContext);
  const isCooked = useAppSelector((state) => {
    if (!canBeCooked) return false;
    const cooksById = selectCooksById(state);
    return meal.items.some(
      (item) =>
        item.kind === 'RECIPE' && cooksById.has(getCookId(meal.id, item.refId)),
    );
  });
  const { totalCents, leftOut } = getPlannedMealCost(meal, costContext);
  const typeLabel = MEAL_TYPE_LABELS[meal.mealType];

  const getCostText = () => {
    if (!showPrice) return null;
    if (totalCents === null) return isPast ? null : 'No price yet';
    const figure = formatCost(totalCents);
    return leftOut.length > 0 ? `${figure}+` : figure;
  };
  const costText = getCostText();
  const detail = [subtitle, isCooked ? '✅ Cooked' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Button
      type='button'
      variant='tertiary'
      aria-label={`Open ${typeLabel.toLowerCase()}: ${title}${isCooked ? ', cooked' : ''}`}
      onClick={onOpen}
      className='h-auto w-full items-start justify-start gap-3 px-0! py-2 text-left font-normal'
    >
      <MealChip
        mealType={meal.mealType}
        className='size-10 rounded-xl text-xl'
      />
      <span className='min-w-0 flex-1'>
        <span className='text-foreground line-clamp-2 block text-sm font-medium break-words whitespace-normal'>
          {title}
        </span>
        {detail && (
          <span className='text-muted-foreground block text-xs'>{detail}</span>
        )}
      </span>
      {costText && (
        <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
          {costText}
        </span>
      )}
    </Button>
  );
}

export default MealRow;
