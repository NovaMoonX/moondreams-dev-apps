import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import EatByBadge from '@apps/pinch/components/containers/EatByBadge';
import {
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
} from '@apps/pinch/constants';
import {
  selectContainersLoadError,
  selectMealsById,
  selectRecipesById,
  selectStockByMealWithRecipes,
  selectStockByRecipe,
} from '@apps/pinch/store/selectors';
import {
  getEatByPhrase,
  getStockParts,
  getStockSourcesText,
  type MealStock,
  type StockSummary,
} from '@apps/pinch/utils/containers';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

interface StockRowsProps {
  target: { kind: 'recipe' | 'meal'; id: string };
  onOpenStock: () => void;
}

const isMealStock = (stock: StockSummary): stock is MealStock =>
  'sources' in stock;

function StockRows({ target, onOpenStock }: StockRowsProps) {
  const stock = useAppSelector((state) =>
    target.kind === 'recipe'
      ? selectStockByRecipe(state).get(target.id)
      : selectStockByMealWithRecipes(state).get(target.id),
  );
  const recipesById = useAppSelector(selectRecipesById);
  const mealsById = useAppSelector(selectMealsById);
  const loadError = useAppSelector(selectContainersLoadError);

  if (loadError !== null || !stock) {
    return null;
  }

  const parts = getStockParts(stock);
  if (parts.length === 0) {
    return null;
  }

  const sourcesText = isMealStock(stock)
    ? getStockSourcesText(stock.sources, (source) =>
        source.kind === 'recipe'
          ? (recipesById.get(source.id)?.title ?? 'A recipe')
          : (mealsById.get(source.id)?.name ?? 'This meal'),
      )
    : null;

  return (
    <div className='flex'>
      <Button
        type='button'
        variant='tertiary'
        onClick={onOpenStock}
        className="text-muted-foreground! relative h-auto max-w-full flex-col items-start gap-1.5 rounded-none p-0 px-0! py-0! text-left text-sm font-normal whitespace-normal after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']"
      >
        {parts.map((part) => {
          const eatBy =
            part.place === 'FRIDGE' ? stock.fridgeEatBy : stock.freezerEatBy;
          const text = `${formatServings(part.servings)} in your ${CONTAINER_PLACE_LABELS[part.place].toLowerCase()}`;
          return (
            <span
              key={part.place}
              className='flex flex-wrap items-center gap-x-2 gap-y-1'
            >
              <span>
                <span aria-hidden='true'>
                  {CONTAINER_PLACE_EMOJIS[part.place]}
                </span>{' '}
                <span className='decoration-muted-foreground/50 underline underline-offset-4'>
                  {part.due === null && eatBy !== null
                    ? `${text}, eat by ${getEatByPhrase(eatBy)}`
                    : text}
                </span>
              </span>
              {part.due && (
                <EatByBadge state={part.due.state} label={part.due.label} />
              )}
            </span>
          );
        })}
        {sourcesText && <span className='text-xs'>{sourcesText}</span>}
      </Button>
    </div>
  );
}

export default StockRows;
