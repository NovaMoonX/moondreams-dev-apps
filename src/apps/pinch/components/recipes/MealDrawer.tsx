import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import FormSection from '@/components/FormSection';
import HelpTip from '@/components/HelpTip';
import MacroStats from '@/components/MacroStats';
import StatTile from '@/components/StatTile';
import { useAppSelector } from '@/store';
import AddToShoppingRow from '@apps/pinch/components/shared/AddToShoppingRow';
import GapNudge from '@apps/pinch/components/shared/GapNudge';
import NudgeCountNote from '@apps/pinch/components/shared/NudgeCountNote';
import {
  selectCostContext,
  selectIngredientsById,
  selectMealsById,
  selectRecipesById,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type { Gap, ShoppingRequest } from '@apps/pinch/types';
import { countLeftOutIngredients, formatLeftOut } from '@apps/pinch/utils/gaps';
import {
  formatCost,
  formatRowCost,
  getItemTitle,
} from '@apps/pinch/utils/mealFormat';
import { getMealCost } from '@apps/pinch/utils/mealMath';
import {
  getMealNutrition,
  getNutritionGaps,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

interface MealDrawerProps {
  uid: string;
  mealId: string;
  onClose: () => void;
  onPlan: (id: string) => void;
  onModify: (id: string) => void;
  onFillIn: (gaps: Gap[]) => void;
  onAddToShopping: (request: ShoppingRequest) => void;
}

function MealDrawer({
  uid,
  mealId,
  onClose,
  onPlan,
  onModify,
  onFillIn,
  onAddToShopping,
}: MealDrawerProps) {
  const meal = useAppSelector(selectMealsById).get(mealId);
  const costContext = useAppSelector(selectCostContext);
  const show = useAppSelector(selectShowNutrition);
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);

  if (!meal) {
    return null;
  }

  const cost = getMealCost(meal.items, costContext);
  const nutrition = getMealNutrition(
    meal.items,
    costContext.recipeNutrition,
    costContext.ingredientsById,
  );
  const leftOutCount = countLeftOutIngredients(cost.leftOut);

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={meal.name}
      footer={
        <div className='flex gap-2 px-4 pb-4'>
          <Button
            type='button'
            variant='secondary'
            className='shrink-0'
            onClick={() => onModify(meal.id)}
          >
            Modify
          </Button>
          <Button
            type='button'
            className='min-w-0 flex-1'
            onClick={() => onPlan(meal.id)}
          >
            Plan it
          </Button>
        </div>
      }
    >
      <div className='space-y-5'>
        <div className='space-y-3'>
          <StatTile
            label='Cost'
            value={
              cost.totalCents === null
                ? 'No prices yet'
                : formatCost(cost.totalCents)
            }
            detail={cost.totalCents === null ? undefined : 'For the plate'}
            help={
              leftOutCount > 0 && cost.totalCents !== null ? (
                <HelpTip
                  variant='warning'
                  title="What's left out"
                  placement='top'
                >
                  <p>
                    This {formatLeftOut(cost.leftOut)} because there’s no price
                    for {leftOutCount === 1 ? 'it' : 'them'} yet.
                  </p>
                  <NudgeCountNote leftOut={cost.leftOut} open={cost.leftOut} />
                </HelpTip>
              ) : undefined
            }
          />
          {hasShownValue(nutrition.values, show) && (
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs'>For the plate</p>
              <MacroStats
                values={nutrition.values}
                show={show}
                variant='tiles'
              />
            </div>
          )}
          <GapNudge
            uid={uid}
            gaps={[
              ...cost.leftOut,
              ...getNutritionGaps(nutrition.missing, show),
            ]}
            onFillIn={onFillIn}
          />
        </div>
        <FormSection title='On the plate' detail={meal.items.length}>
          <ul className='divide-border divide-y'>
            {meal.items.map((item) => {
              const itemCost = cost.items.get(item.id);
              return (
                <li key={item.id} className='flex items-start gap-3 py-2.5'>
                  <span className='min-w-0 flex-1'>
                    <span className='block'>
                      {getItemTitle(item, recipesById, ingredientsById)}
                    </span>
                    <span className='text-muted-foreground block text-xs'>
                      {formatServings(item.servings)}
                    </span>
                  </span>
                  <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
                    {formatRowCost(itemCost?.cents, false)}
                  </span>
                </li>
              );
            })}
          </ul>
        </FormSection>
        <AddToShoppingRow
          subtitle='Choose what you need for this meal'
          onClick={() =>
            onAddToShopping({
              kind: 'items',
              items: meal.items,
              label: meal.name,
            })
          }
        />
      </div>
    </DetailSheet>
  );
}

export default MealDrawer;
