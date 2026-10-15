import GroupRow, { GroupRowLines } from '@/components/GroupRow';
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

  const ariaLabel = parts
    .map((part) =>
      [
        `${formatServings(part.servings)} in your ${CONTAINER_PLACE_LABELS[part.place].toLowerCase()}`,
        part.due?.label,
      ]
        .filter((piece) => piece !== undefined)
        .join(', '),
    )
    .join('; ');

  return (
    <GroupRow ariaLabel={ariaLabel} onClick={onOpenStock}>
      <GroupRowLines
        lines={parts.map((part) => ({
          key: part.place,
          icon: CONTAINER_PLACE_EMOJIS[part.place],
          content: (
            <span className='flex flex-wrap items-center gap-x-2 gap-y-1'>
              <span>
                {part.servings} in the{' '}
                {CONTAINER_PLACE_LABELS[part.place].toLowerCase()}
              </span>
              {part.due && (
                <EatByBadge state={part.due.state} label={part.due.label} />
              )}
            </span>
          ),
        }))}
      />
      {sourcesText && (
        <span className='text-muted-foreground mt-1 block pl-7.5 text-xs'>
          {sourcesText}
        </span>
      )}
    </GroupRow>
  );
}

export default StockRows;
