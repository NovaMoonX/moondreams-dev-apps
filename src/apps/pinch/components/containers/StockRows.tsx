import ActionGroup from '@/components/ActionGroup';
import GroupRow from '@/components/GroupRow';
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
import type { ContainerPlace } from '@apps/pinch/types';
import {
  getStockParts,
  getStockSourcesText,
  type MealStock,
  type StockSummary,
} from '@apps/pinch/utils/containers';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

interface StockRowsProps {
  target: { kind: 'recipe' | 'meal'; id: string };
  onOpenStock: (place: ContainerPlace) => void;
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
    <div className='space-y-2'>
      <ActionGroup isRoomy caption='In your fridge and freezer'>
        {parts.map((part) => {
          const title = `${formatServings(part.servings)} in the ${CONTAINER_PLACE_LABELS[part.place].toLowerCase()}`;
          return (
            <GroupRow
              key={part.place}
              isRoomy
              icon={CONTAINER_PLACE_EMOJIS[part.place]}
              ariaLabel={part.due ? `${title}, ${part.due.label}` : undefined}
              onClick={() => onOpenStock(part.place)}
            >
              <span className='block font-medium'>{title}</span>
              {part.due && (
                <span className='mt-1 flex'>
                  <EatByBadge state={part.due.state} label={part.due.label} />
                </span>
              )}
            </GroupRow>
          );
        })}
      </ActionGroup>
      {sourcesText && (
        <p className='text-muted-foreground text-sm'>{sourcesText}</p>
      )}
    </div>
  );
}

export default StockRows;
