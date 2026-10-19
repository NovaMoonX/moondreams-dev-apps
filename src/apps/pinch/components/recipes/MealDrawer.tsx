import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronLeft, Ellipsis, PackagePlus } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import FormSection from '@/components/FormSection';
import MacroStats from '@/components/MacroStats';
import StarButton from '@/components/StarButton';
import StatTile from '@/components/StatTile';
import { useBackStep } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import StockRows from '@apps/pinch/components/containers/StockRows';
import {
  PlateRecipeView,
  PlateRows,
} from '@apps/pinch/components/recipes/PlateRecipe';
import { SECTION_COUNT_THRESHOLD } from '@apps/pinch/constants';
import ShareDoorRow from '@apps/pinch/components/share/ShareDoorRow';
import ShareView from '@apps/pinch/components/share/ShareView';
import AddToShoppingRow from '@apps/pinch/components/shared/AddToShoppingRow';
import LeftOutTip from '@apps/pinch/components/shared/LeftOutTip';
import {
  selectContainersLoadError,
  selectCostContext,
  selectIsContainersReady,
  selectMealsById,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type {
  ContainerPlace,
  Gap,
  Meal,
  ShoppingRequest,
} from '@apps/pinch/types';
import { isStarred } from '@apps/pinch/utils/favorites';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import { formatCostTile } from '@apps/pinch/utils/mealFormat';
import { getMealCost } from '@apps/pinch/utils/mealMath';
import {
  getMealNutrition,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';
import { withWholeCalories } from '@apps/pinch/utils/stats';

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
  uid: string;
  mealId: string;
  onClose: () => void;
  onPlan: (id: string) => void;
  onModify: (id: string) => void;
  onAddToShopping: (request: ShoppingRequest) => void;
  onOpenStock: (id: string, place: ContainerPlace) => void;
  onPutAway: (id: string) => void;
  onToggleFavorite: (meal: Meal) => void;
}

function MealDrawer({
  uid,
  mealId,
  onClose,
  onPlan,
  onModify,
  onAddToShopping,
  onOpenStock,
  onPutAway,
  onToggleFavorite,
}: MealDrawerProps) {
  const meal = useAppSelector(selectMealsById).get(mealId);
  const costContext = useAppSelector(selectCostContext);
  const show = useAppSelector(selectShowNutrition);
  const isStockReady = useAppSelector(selectIsContainersReady);
  const stockError = useAppSelector(selectContainersLoadError);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  if (!meal) {
    return null;
  }

  const closeMore = () => {
    setIsMoreOpen(false);
    window.requestAnimationFrame(() => moreRef.current?.focus());
  };
  const getViewKey = () => {
    if (openRecipeId !== null) return `recipe:${openRecipeId}`;
    if (isShareOpen) return 'share';
    return isMoreOpen ? 'more' : 'plate';
  };

  const cost = getMealCost(meal.items, costContext);
  const nutrition = getMealNutrition(
    meal.items,
    costContext.recipeNutrition,
    costContext.ingredientsById,
  );
  const leftOutCount = countLeftOutIngredients(cost.leftOut);
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
      viewKey={getViewKey()}
      actions={
        <StarButton
          isOn={isStarred(meal)}
          label={`Favorite ${meal.name}`}
          onClassName='text-[var(--pinch-drizzle)]'
          onClick={() => onToggleFavorite(meal)}
        />
      }
      footer={
        openRecipeId !== null || isShareOpen ? undefined : (
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
        )
      }
    >
      {openRecipeId !== null && (
        <PlateRecipeView
          uid={uid}
          recipeId={openRecipeId}
          onBack={() => setOpenRecipeId(null)}
        />
      )}
      {isShareOpen && openRecipeId === null && (
        <div className='space-y-4'>
          <div className='space-y-1'>
            <BackLink onBack={() => setIsShareOpen(false)} />
            <p className='font-medium'>Share this saved meal</p>
          </div>
          <ShareView kind='MEAL' sourceId={meal.id} />
        </div>
      )}
      {isMoreOpen && !isShareOpen && openRecipeId === null && (
        <div className='space-y-5'>
          <BackLink onBack={closeMore} />
          <div className='space-y-2'>
            <ActionGroup isRoomy caption='What would you like to do?'>
              <AddToShoppingRow
                isGrouped
                isRoomy
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
                  isRoomy
                  hasChevron
                  icon={<PackagePlus />}
                  label='Put some away'
                  subtitle={
                    'In the fridge or freezer, with an eat\u2011by date'
                  }
                  isDisabled={!isStockReady}
                  onClick={() => onPutAway(meal.id)}
                />
              )}
              <ShareDoorRow
                kind='MEAL'
                sourceId={meal.id}
                onClick={() => setIsShareOpen(true)}
              />
            </ActionGroup>
            {stockError === null && !isStockReady && (
              <p className='text-muted-foreground text-sm'>
                Loading your fridge and freezer…
              </p>
            )}
          </div>
          <StockRows
            target={{ kind: 'meal', id: meal.id }}
            onOpenStock={(place) => onOpenStock(meal.id, place)}
          />
        </div>
      )}
      <div
        className={join(
          'space-y-5',
          (isMoreOpen || openRecipeId !== null) && 'hidden',
        )}
      >
        <FormSection
          title='On the plate'
          detail={
            meal.items.length > SECTION_COUNT_THRESHOLD
              ? meal.items.length
              : undefined
          }
        >
          <PlateRows
            items={meal.items}
            cost={cost}
            onOpenRecipe={setOpenRecipeId}
          />
        </FormSection>
        <div className='space-y-3'>
          <StatTile
            label='Cost'
            value={formatCostTile(cost.totalCents, leftOutCount, false)}
            help={
              leftOutCount > 0 && cost.totalCents !== null ? (
                <LeftOutTip leftOut={cost.leftOut} fix={getFix()} />
              ) : undefined
            }
          />
          {hasShownValue(nutrition.values, show) && (
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs font-medium'>
                For the plate
              </p>
              <MacroStats
                variant='tiles'
                values={withWholeCalories(nutrition.values)}
                show={show}
              />
            </div>
          )}
        </div>
      </div>
    </DetailSheet>
  );
}

export default MealDrawer;
