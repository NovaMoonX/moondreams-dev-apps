import MacroStats from '@/components/MacroStats';
import { useAppSelector } from '@/store';
import { MEAL_TYPE_EMOJIS, MEAL_TYPE_LABELS } from '@apps/pinch/constants';
import {
  selectIngredientsById,
  selectPeriodStats,
  selectRecipesById,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type {
  PlannedMeal,
  Recipe,
  ResolvedIngredient,
} from '@apps/pinch/types';
import { formatDayTitle } from '@apps/pinch/utils/dayKeys';
import {
  getItemTitle,
  getPlannedMealTitle,
} from '@apps/pinch/utils/mealFormat';
import { hasShownValue } from '@apps/pinch/utils/nutritionMath';
import { withWholeCalories } from '@apps/pinch/utils/stats';

const MAX_ROWS = 5;

const getMealDetail = (
  meal: PlannedMeal,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, ResolvedIngredient>,
) => {
  const names = meal.items.map((item) =>
    getItemTitle(item, recipesById, ingredientsById),
  );
  if (meal.name?.trim()) return names.join(', ');
  return names.length > 1 ? `With ${names.slice(1).join(', ')}` : null;
};

interface DayPeekProps {
  dayKey: string;
  meals: PlannedMeal[];
}

/** What a day's hover card shows on a computer: each meal under its type with its items. */
function DayPeek({ dayKey, meals }: DayPeekProps) {
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const show = useAppSelector(selectShowNutrition);
  const { dailyNutrition } = useAppSelector((state) =>
    selectPeriodStats(state, dayKey, dayKey),
  );

  return (
    <div className='space-y-1 text-left'>
      <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
        {formatDayTitle(dayKey)}
      </p>
      {meals.slice(0, MAX_ROWS).map((meal) => {
        const detail = getMealDetail(meal, recipesById, ingredientsById);
        return (
          <div key={meal.id} className='py-1'>
            <p className='text-sm font-medium wrap-break-word'>
              <span aria-hidden='true'>{MEAL_TYPE_EMOJIS[meal.mealType]}</span>{' '}
              {MEAL_TYPE_LABELS[meal.mealType]} ·{' '}
              {getPlannedMealTitle(meal, recipesById, ingredientsById)}
            </p>
            {detail && (
              <p className='text-muted-foreground text-xs'>{detail}</p>
            )}
          </div>
        );
      })}
      {hasShownValue(dailyNutrition, show) && (
        <MacroStats
          className='text-muted-foreground pt-1 text-xs'
          values={withWholeCalories(dailyNutrition)}
          show={show}
        />
      )}
      {meals.length > MAX_ROWS && (
        <p className='text-muted-foreground pt-1 text-xs'>
          +{meals.length - MAX_ROWS} more
        </p>
      )}
    </div>
  );
}

export default DayPeek;
