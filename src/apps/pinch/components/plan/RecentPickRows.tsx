import { useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import { useAppSelector } from '@/store';
import StockLine from '@apps/pinch/components/containers/StockLine';
import CoverImage from '@apps/pinch/components/shared/CoverImage';
import { useListViewOptions } from '@apps/pinch/hooks/useListViewOptions';
import {
  selectCostContext,
  selectMealsById,
  selectRecipeCosts,
  selectRecipesById,
  selectStockByMealWithRecipes,
  selectStockByRecipe,
} from '@apps/pinch/store/selectors';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import { formatRowPrice } from '@apps/pinch/utils/mealFormat';
import { getMealCost } from '@apps/pinch/utils/mealMath';
import {
  getRecentRowWindow,
  type RecentPick,
} from '@apps/pinch/utils/planPicks';
import {
  formatMinutes,
  formatServings,
  getTotalMinutes,
} from '@apps/pinch/utils/recipeFormat';

interface RowShellProps {
  lead: ReactNode;
  title: string;
  facts: string[];
  stock: ReactNode;
  onPick: () => void;
}

function RowShell({ lead, title, facts, stock, onPick }: RowShellProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      size='stripped'
      rounded='none'
      aria-label={`Add ${title}`}
      onClick={onPick}
      className='text-foreground! hover:bg-muted flex min-h-16 w-full items-start justify-start gap-3 px-3 py-2 text-left font-normal whitespace-normal focus-visible:rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2'
    >
      {lead}
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-base font-medium'>{title}</span>
        <span className='text-muted-foreground block overflow-x-clip text-xs font-normal'>
          <span className='-ml-4 flex flex-wrap items-center'>
            {facts.map((fact) => (
              <span
                key={fact}
                className="inline-flex items-center whitespace-nowrap before:w-4 before:shrink-0 before:text-center before:content-['·']"
              >
                {fact}
              </span>
            ))}
          </span>
        </span>
        {stock}
      </span>
      <Plus
        className='text-muted-foreground mt-3.5 size-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

interface RecentPickRowsProps {
  uid: string;
  caption: string;
  picks: RecentPick[];
  /** Called with `RECIPE:<id>` or `MEAL:<id>`. */
  onPick: (value: string) => void;
}

/** The person's recent recipes and saved meals as roomy rows with their facts and what is in the fridge or freezer, six of them until "Show N more". */
function RecentPickRows({ uid, caption, picks, onPick }: RecentPickRowsProps) {
  const { options } = useListViewOptions(uid, 'recipes');
  const recipesById = useAppSelector(selectRecipesById);
  const mealsById = useAppSelector(selectMealsById);
  const recipeCosts = useAppSelector(selectRecipeCosts);
  const costContext = useAppSelector(selectCostContext);
  const stockByRecipe = useAppSelector(selectStockByRecipe);
  const stockByMeal = useAppSelector(selectStockByMealWithRecipes);
  const [isExpanded, setIsExpanded] = useState(false);
  const { shown, hasToggle } = getRecentRowWindow(picks.length, isExpanded);

  const getRecipeRow = (pick: RecentPick) => {
    const recipe = recipesById.get(pick.id);
    if (!recipe) return null;
    const cost = recipeCosts.get(recipe.id);
    const total = getTotalMinutes(recipe);
    const price = () => {
      if (!options.showPrices || !cost) return null;
      if (cost.perServingCents == null) return 'No price yet';
      return `${formatRowPrice(cost.perServingCents, countLeftOutIngredients(cost.leftOut) > 0)} per serving`;
    };
    const facts = [
      formatServings(recipe.servings),
      total === null ? null : formatMinutes(total),
      price(),
    ].filter((fact) => fact !== null);
    return (
      <RowShell
        key={`${pick.kind}:${pick.id}`}
        lead={
          <CoverImage
            coverPath={recipe.coverPath ?? null}
            version={recipe.updatedAt}
            size={48}
          />
        }
        title={recipe.title}
        facts={facts}
        stock={
          options.showStock && (
            <StockLine summary={stockByRecipe.get(recipe.id)} />
          )
        }
        onPick={() => onPick(`${pick.kind}:${pick.id}`)}
      />
    );
  };

  const getMealRow = (pick: RecentPick) => {
    const meal = mealsById.get(pick.id);
    if (!meal) return null;
    const cost = getMealCost(meal.items, costContext);
    const price = () => {
      if (!options.showPrices) return null;
      if (cost.totalCents === null) return 'No price yet';
      return formatRowPrice(
        cost.totalCents,
        countLeftOutIngredients(cost.leftOut) > 0,
      );
    };
    const facts = [
      'Saved meal',
      `${meal.items.length} ${meal.items.length === 1 ? 'item' : 'items'}`,
      price(),
    ].filter((fact) => fact !== null);
    return (
      <RowShell
        key={`${pick.kind}:${pick.id}`}
        lead={
          <span
            className='bg-accent text-accent-foreground flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl'
            aria-hidden='true'
          >
            🍽️
          </span>
        }
        title={meal.name}
        facts={facts}
        stock={
          options.showStock && (
            <StockLine summary={stockByMeal.get(meal.id)} kind='meal' />
          )
        }
        onPick={() => onPick(`${pick.kind}:${pick.id}`)}
      />
    );
  };

  return (
    <div className='space-y-1'>
      <ActionGroup isRoomy caption={caption}>
        {picks
          .slice(0, shown)
          .map((pick) =>
            pick.kind === 'MEAL' ? getMealRow(pick) : getRecipeRow(pick),
          )}
      </ActionGroup>
      {hasToggle && (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='h-10 px-0!'
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((current) => !current)}
        >
          {isExpanded ? 'Show fewer' : `Show ${picks.length - shown} more`}
        </Button>
      )}
    </div>
  );
}

export default RecentPickRows;
