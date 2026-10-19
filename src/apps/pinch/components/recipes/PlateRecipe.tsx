import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import GroupRow from '@/components/GroupRow';
import { useBackStep } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import RecipeFront from '@apps/pinch/components/recipes/RecipeFront';
import {
  selectIngredientsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { MealItem } from '@apps/pinch/types';
import { formatRowPrice, getItemTitle } from '@apps/pinch/utils/mealFormat';
import type { MealCost } from '@apps/pinch/utils/mealMath';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

interface PlateRowsProps {
  items: MealItem[];
  cost: MealCost;
  onOpenRecipe: (recipeId: string) => void;
  /** Under a row of its own, for what acts on that item (a recipe's "Mark as cooked"). */
  renderExtra?: (item: MealItem) => ReactNode;
}

/** The items on a plate in one framed block: a recipe that still exists opens in place, an ingredient or a removed recipe is a plain row. */
export function PlateRows({
  items,
  cost,
  onOpenRecipe,
  renderExtra,
}: PlateRowsProps) {
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);

  return (
    <ActionGroup>
      {items.map((item) => {
        const title = getItemTitle(item, recipesById, ingredientsById);
        const itemCost = cost.items.get(item.id);
        const content = (
          <span className='flex items-start gap-3'>
            <span className='min-w-0 flex-1'>
              <span className='block text-base wrap-break-word'>{title}</span>
              <span className='text-muted-foreground block text-xs'>
                {formatServings(item.servings)}
              </span>
            </span>
            <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
              <span aria-hidden={itemCost?.cents == null}>
                {formatRowPrice(
                  itemCost?.cents,
                  (itemCost?.gaps.length ?? 0) > 0,
                )}
              </span>
              {itemCost?.cents == null && (
                <span className='sr-only'>No price</span>
              )}
            </span>
          </span>
        );
        return (
          <div key={item.id}>
            {item.kind === 'RECIPE' && recipesById.has(item.refId) ? (
              <GroupRow
                ariaLabel={`Open ${title}`}
                onClick={() => onOpenRecipe(item.refId)}
              >
                {content}
              </GroupRow>
            ) : (
              <div className='py-2.5 pr-11 pl-4 text-sm'>{content}</div>
            )}
            {renderExtra?.(item)}
          </div>
        );
      })}
    </ActionGroup>
  );
}

interface PlateRecipeViewProps {
  uid: string;
  recipeId: string;
  onBack: () => void;
}

/** A recipe from a plate, read in the plate's own sheet with a way back; its actions stay on the recipe's drawer. */
export function PlateRecipeView({
  uid,
  recipeId,
  onBack,
}: PlateRecipeViewProps) {
  const recipe = useAppSelector(selectRecipesById).get(recipeId);
  useBackStep(true, onBack);

  return (
    <div className='space-y-4'>
      <div className='space-y-1 [@media(max-height:599px)]:flex [@media(max-height:599px)]:items-center [@media(max-height:599px)]:gap-3 [@media(max-height:599px)]:space-y-0'>
        <Button
          type='button'
          variant='tertiary'
          className='h-10 shrink-0 gap-1 px-0!'
          onClick={onBack}
        >
          <ChevronLeft className='h-4 w-4' aria-hidden='true' />
          Back
        </Button>
        <h3 className='min-w-0 text-lg font-semibold wrap-break-word'>
          {recipe?.title ?? 'Removed recipe'}
        </h3>
      </div>
      {recipe && <RecipeFront uid={uid} recipe={recipe} />}
    </div>
  );
}
