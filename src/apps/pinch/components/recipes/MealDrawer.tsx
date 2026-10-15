import { Button } from '@moondreamsdev/dreamer-ui/components';
import { PackagePlus, ShoppingBasket } from 'lucide-react';

import ActionChips, { type ActionChip } from '@/components/ActionChips';
import ActionGroup from '@/components/ActionGroup';
import DetailSheet from '@/components/DetailSheet';
import FactsLine from '@/components/FactsLine';
import FormSection from '@/components/FormSection';
import MacroStats from '@/components/MacroStats';
import { useAppSelector } from '@/store';
import StockRows from '@apps/pinch/components/containers/StockRows';
import { SECTION_COUNT_THRESHOLD } from '@apps/pinch/constants';
import LeftOutTip from '@apps/pinch/components/shared/LeftOutTip';
import {
  selectContainersLoadError,
  selectCostContext,
  selectIngredientsById,
  selectIsContainersReady,
  selectMealsById,
  selectRecipesById,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type { Gap, ShoppingRequest } from '@apps/pinch/types';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import {
  formatCost,
  formatRowPrice,
  getItemTitle,
} from '@apps/pinch/utils/mealFormat';
import { getMealCost } from '@apps/pinch/utils/mealMath';
import {
  getMealNutrition,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

interface MealDrawerProps {
  /** Not read: a saved meal's prices are added from its recipes. */
  uid?: string;
  mealId: string;
  onClose: () => void;
  onPlan: (id: string) => void;
  onModify: (id: string) => void;
  /** Not read: a saved meal's prices are added from its recipes. */
  onFillIn?: (gaps: Gap[]) => void;
  onAddToShopping: (request: ShoppingRequest) => void;
  onOpenStock: (id: string) => void;
  onPutAway: (id: string) => void;
}

function MealDrawer({
  mealId,
  onClose,
  onPlan,
  onModify,
  onAddToShopping,
  onOpenStock,
  onPutAway,
}: MealDrawerProps) {
  const meal = useAppSelector(selectMealsById).get(mealId);
  const costContext = useAppSelector(selectCostContext);
  const show = useAppSelector(selectShowNutrition);
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const isStockReady = useAppSelector(selectIsContainersReady);
  const stockError = useAppSelector(selectContainersLoadError);

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
  const getCostValue = () => {
    if (cost.totalCents === null) return 'No price yet';
    const total = formatCost(cost.totalCents);
    return leftOutCount > 0
      ? `${total} so far for the plate`
      : `${total} for the plate`;
  };
  const isOnPlate = (gap: Gap) =>
    meal.items.some(
      (item) => item.kind === 'INGREDIENT' && item.refId === gap.ingredientId,
    );
  const getFix = () => {
    const onPlate = cost.leftOut.filter(isOnPlate).length;
    if (onPlate === 0) return 'Add prices from the recipes on this plate.';
    if (onPlate === cost.leftOut.length) {
      return onPlate === 1
        ? 'Add its price in Kitchen.'
        : 'Add their prices in Kitchen.';
    }
    return 'Add prices from the recipes on this plate, or in Kitchen.';
  };
  const actions: ActionChip[] = [
    {
      key: 'shopping',
      icon: <ShoppingBasket className='h-4 w-4' />,
      label: 'Shopping list',
      description: 'Add to shopping list: choose what you need for this meal',
      onClick: () =>
        onAddToShopping({
          kind: 'items',
          items: meal.items,
          label: meal.name,
          mealId: meal.id,
        }),
    },
    stockError === null && {
      key: 'put-away',
      icon: <PackagePlus className='h-4 w-4' />,
      label: 'Put some away',
      description:
        'Put some away in the fridge or freezer, with an eat-by date',
      isDisabled: !isStockReady,
      onClick: () => onPutAway(meal.id),
    },
  ].filter((action) => action !== false);

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
        <div className='space-y-2.5'>
          <FactsLine
            className='text-muted-foreground text-sm'
            facts={[
              {
                key: 'cost',
                content: (
                  <>
                    {getCostValue()}
                    {leftOutCount > 0 && (
                      <span className='ml-1 inline-flex align-middle'>
                        <LeftOutTip leftOut={cost.leftOut} fix={getFix()} />
                      </span>
                    )}
                  </>
                ),
              },
            ]}
          />
          <ActionGroup>
            <StockRows
              target={{ kind: 'meal', id: meal.id }}
              onOpenStock={() => onOpenStock(meal.id)}
            />
          </ActionGroup>
          <div className='space-y-1.5'>
            <ActionChips label='Meal actions' actions={actions} />
            {stockError === null && !isStockReady && (
              <p className='text-muted-foreground text-xs'>
                Loading your prepared meals…
              </p>
            )}
          </div>
        </div>
        <FormSection
          title='On the plate'
          detail={
            meal.items.length > SECTION_COUNT_THRESHOLD
              ? meal.items.length
              : undefined
          }
        >
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
                    {formatRowPrice(
                      itemCost?.cents,
                      (itemCost?.gaps.length ?? 0) > 0,
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </FormSection>
        {hasShownValue(nutrition.values, show) && (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>For the plate</p>
            <MacroStats values={nutrition.values} show={show} variant='tiles' />
          </div>
        )}
      </div>
    </DetailSheet>
  );
}

export default MealDrawer;
