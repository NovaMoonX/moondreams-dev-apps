import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ClipboardCopy } from 'lucide-react';

import CopyPanel from '@/components/CopyPanel';
import DetailSheet from '@/components/DetailSheet';
import { useAppSelector } from '@/store';
import GapNudge from '@apps/pinch/components/shared/GapNudge';
import NutritionLine from '@apps/pinch/components/shared/NutritionLine';
import ItemIcon from '@apps/pinch/components/shared/ItemIcon';
import {
  selectCostContext,
  selectIngredientsById,
  selectMealsById,
  selectRecipesById,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type { Gap } from '@apps/pinch/types';
import { countLeftOutIngredients, formatLeftOut } from '@apps/pinch/utils/gaps';
import { mealMarkdown } from '@apps/pinch/utils/markdown/dayMarkdown';
import { formatCost, getItemTitle } from '@apps/pinch/utils/mealFormat';
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
}

function MealDrawer({
  uid,
  mealId,
  onClose,
  onPlan,
  onModify,
  onFillIn,
}: MealDrawerProps) {
  const meal = useAppSelector(selectMealsById).get(mealId);
  const costContext = useAppSelector(selectCostContext);
  const show = useAppSelector(selectShowNutrition);
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [isCopying, setIsCopying] = useState(false);

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
        !isCopying && (
          <div className='px-4 pb-4'>
            <Button
              type='button'
              className='w-full'
              onClick={() => onPlan(meal.id)}
            >
              Plan it
            </Button>
          </div>
        )
      }
    >
      {isCopying ? (
        <CopyPanel
          text={mealMarkdown(meal.name, meal.items, {
            recipesById,
            ingredientsById,
          })}
          note='The plate, with each recipe’s ingredients. No prices or stores.'
          onBack={() => setIsCopying(false)}
        />
      ) : (
        <div className='space-y-5'>
          <ul className='divide-border divide-y'>
            {meal.items.map((item) => {
              const itemCost = cost.items.get(item.id);
              return (
                <li key={item.id} className='flex items-start gap-3 py-2.5'>
                  <ItemIcon
                    kind={item.kind}
                    iconKey={
                      item.kind === 'INGREDIENT'
                        ? (ingredientsById.get(item.refId)?.iconKey ?? null)
                        : null
                    }
                  />
                  <span className='min-w-0 flex-1'>
                    <span className='block'>
                      {getItemTitle(item, recipesById, ingredientsById)}
                    </span>
                    <span className='text-muted-foreground block text-xs'>
                      {formatServings(item.servings)}
                    </span>
                  </span>
                  <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
                    {itemCost?.cents == null
                      ? 'No price'
                      : formatCost(itemCost.cents)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div>
            <p className='text-sm'>
              <span className='font-medium'>
                {cost.totalCents === null
                  ? 'No prices yet'
                  : formatCost(cost.totalCents)}
              </span>
              {leftOutCount > 0 && cost.totalCents !== null && (
                <span className='text-muted-foreground'>
                  {' '}
                  · {formatLeftOut(cost.leftOut)}
                </span>
              )}
            </p>
            {hasShownValue(nutrition.values, show) && (
              <p className='text-muted-foreground text-sm'>
                <NutritionLine values={nutrition.values} show={show} /> for the
                plate
              </p>
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
          <div className='bg-muted/50 rounded-2xl p-1'>
            <Button
              type='button'
              variant='tertiary'
              className='h-11 w-full'
              onClick={() => onModify(meal.id)}
            >
              Modify
            </Button>
            <Button
              type='button'
              variant='tertiary'
              className='h-11 w-full gap-2'
              onClick={() => setIsCopying(true)}
            >
              <ClipboardCopy className='h-4 w-4' aria-hidden='true' />
              Copy for a chat
            </Button>
          </div>
        </div>
      )}
    </DetailSheet>
  );
}

export default MealDrawer;
