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
import { formatDayHeading } from '@apps/pinch/utils/dayKeys';
import {
  getItemTitle,
  getPlannedMealTitle,
  getPlateTitle,
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
  const { namedCount } = getPlateTitle(names);
  return namedCount < names.length
    ? `With ${names.slice(namedCount).join(', ')}`
    : null;
};

interface DayPeekProps {
  dayKey: string;
  isToday: boolean;
  meals: PlannedMeal[];
}

/** What a day's hover card shows on a computer: each meal under its type with its items. */
function DayPeek({ dayKey, isToday, meals }: DayPeekProps) {
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const show = useAppSelector(selectShowNutrition);
  const { dailyNutrition } = useAppSelector((state) =>
    selectPeriodStats(state, dayKey, dayKey),
  );

  return (
    <div className='space-y-1 text-left'>
      <p className='text-sm font-semibold'>
        {formatDayHeading(dayKey, isToday)}
      </p>
      <ul className='space-y-1.5 pt-1'>
        {meals.slice(0, MAX_ROWS).map((meal) => {
          const detail = getMealDetail(meal, recipesById, ingredientsById);
          return (
            <li key={meal.id} className='flex items-start gap-2'>
              <span
                className='w-5 shrink-0 text-center text-sm'
                aria-hidden='true'
              >
                {MEAL_TYPE_EMOJIS[meal.mealType]}
              </span>
              <span className='min-w-0 flex-1'>
                <span className='line-clamp-2 text-sm font-medium break-words'>
                  {getPlannedMealTitle(meal, recipesById, ingredientsById)}
                </span>
                <span className='text-muted-foreground block text-xs'>
                  {[MEAL_TYPE_LABELS[meal.mealType], detail]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
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
