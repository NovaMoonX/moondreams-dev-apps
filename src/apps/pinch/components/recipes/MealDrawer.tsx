import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronLeft, Ellipsis, PackagePlus } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import FactsLine from '@/components/FactsLine';
import FormSection from '@/components/FormSection';
import MacroStats from '@/components/MacroStats';
import { useBackStep } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import StockRows from '@apps/pinch/components/containers/StockRows';
import { SECTION_COUNT_THRESHOLD } from '@apps/pinch/constants';
import AddToShoppingRow from '@apps/pinch/components/shared/AddToShoppingRow';
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

interface BackLinkProps {
  onBack: () => void;
}

function BackLink({ onBack }: BackLinkProps) {
  useBackStep(true, onBack);

  return (
    <Button
      type='button'
      variant='tertiary'
      className='h-10 gap-1 px-0!'
      onClick={onBack}
    >
      <ChevronLeft className='h-4 w-4' aria-hidden='true' />
      Back
    </Button>
  );
}

interface MealDrawerProps {
  mealId: string;
  onClose: () => void;
  onPlan: (id: string) => void;
  onModify: (id: string) => void;
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
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  if (!meal) {
    return null;
  }

  const closeMore = () => {
    setIsMoreOpen(false);
    window.requestAnimationFrame(() => moreRef.current?.focus());
  };

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

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={meal.name}
      viewKey={isMoreOpen ? 'more' : 'plate'}
      footer={
        <div className='flex gap-2 px-4 pb-4'>
          <Button
            type='button'
            variant='secondary'
            className='shrink-0 max-sm:px-3'
            onClick={() => onModify(meal.id)}
          >
            Modify
          </Button>
          <Button
            ref={moreRef}
            type='button'
            variant='secondary'
            size='icon'
            aria-label='More for this saved meal'
            title='More for this saved meal'
            aria-expanded={isMoreOpen}
            onClick={() => setIsMoreOpen((open) => !open)}
            className={join(
              'text-foreground! size-10 min-w-10 shrink-0 p-0',
              isMoreOpen && 'bg-accent!',
            )}
          >
            <Ellipsis className='h-5 w-5' aria-hidden='true' />
          </Button>
          <Button
            type='button'
            className='min-w-0 flex-1 whitespace-nowrap max-sm:px-3'
            onClick={() => onPlan(meal.id)}
          >
            Plan it
          </Button>
        </div>
      }
    >
      {isMoreOpen && (
        <div className='space-y-3'>
          <BackLink onBack={closeMore} />
          <ActionGroup>
            <StockRows
              target={{ kind: 'meal', id: meal.id }}
              onOpenStock={() => onOpenStock(meal.id)}
            />
          </ActionGroup>
          <ActionGroup>
            <AddToShoppingRow
              isGrouped
              subtitle='Choose what you need for this meal'
              onClick={() =>
                onAddToShopping({
                  kind: 'items',
                  items: meal.items,
                  label: meal.name,
                  mealId: meal.id,
                })
              }
            />
            {stockError === null && (
              <ActionRow
                isGrouped
                icon={<PackagePlus className='h-4 w-4' />}
                label='Put some away'
                subtitle='In the fridge or freezer, with an eat-by date'
                isDisabled={!isStockReady}
                onClick={() => onPutAway(meal.id)}
              />
            )}
          </ActionGroup>
          {stockError === null && !isStockReady && (
            <p className='text-muted-foreground text-xs'>
              Loading your fridge and freezer…
            </p>
          )}
        </div>
      )}
      <div className={join('space-y-5', isMoreOpen && 'hidden')}>
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
