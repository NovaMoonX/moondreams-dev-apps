import { join } from '@moondreamsdev/dreamer-ui/utils';

import { MEAL_TYPE_COLORS, MEAL_TYPE_EMOJIS } from '@apps/pinch/constants';
import type { MealType } from '@apps/pinch/types';

interface MealChipProps {
  mealType: MealType;
  className?: string;
}

/** A meal's emoji on a soft tint of its colour: how a meal is marked wherever there is no room for its name. */
function MealChip({ mealType, className }: MealChipProps) {
  return (
    <span
      aria-hidden='true'
      className={join(
        'grid shrink-0 place-items-center rounded-md leading-none',
        className,
      )}
      style={{ backgroundColor: MEAL_TYPE_COLORS[mealType].soft }}
    >
      {MEAL_TYPE_EMOJIS[mealType]}
    </span>
  );
}

export default MealChip;
