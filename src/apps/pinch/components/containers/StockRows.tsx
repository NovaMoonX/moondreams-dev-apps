import { PackagePlus, Refrigerator } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import { useAppSelector } from '@/store';
import { CONTAINER_PLACE_EMOJIS } from '@apps/pinch/constants';
import { useContainerActions } from '@apps/pinch/hooks/useContainerActions';
import {
  selectMealsById,
  selectRecipesById,
  selectStockByMealWithRecipes,
  selectStockByRecipe,
} from '@apps/pinch/store/selectors';
import {
  getStockDetail,
  getStockSourcesText,
  getStockTitle,
  type MealStock,
  type StockSummary,
} from '@apps/pinch/utils/containers';

interface StockRowsProps {
  uid: string;
  target: { kind: 'recipe' | 'meal'; id: string };
  onOpenStock: () => void;
  onPutAway: () => void;
}

const isMealStock = (stock: StockSummary): stock is MealStock =>
  'sources' in stock;

const getIcon = (stock: StockSummary) => {
  if (stock.fridge > 0 && stock.freezer === 0) {
    return (
      <span className='text-base leading-none'>
        {CONTAINER_PLACE_EMOJIS.FRIDGE}
      </span>
    );
  }
  if (stock.freezer > 0 && stock.fridge === 0) {
    return (
      <span className='text-base leading-none'>
        {CONTAINER_PLACE_EMOJIS.FREEZER}
      </span>
    );
  }
  return <Refrigerator className='h-4 w-4' />;
};

function StockRows({ uid, target, onOpenStock, onPutAway }: StockRowsProps) {
  const stock = useAppSelector((state) =>
    target.kind === 'recipe'
      ? selectStockByRecipe(state).get(target.id)
      : selectStockByMealWithRecipes(state).get(target.id),
  );
  const recipesById = useAppSelector(selectRecipesById);
  const mealsById = useAppSelector(selectMealsById);
  const { isReady, loadError } = useContainerActions(uid);

  if (loadError !== null) {
    return null;
  }

  const sourcesText =
    stock && isMealStock(stock)
      ? getStockSourcesText(stock.sources, (source) =>
          source.kind === 'recipe'
            ? (recipesById.get(source.id)?.title ?? 'A recipe')
            : (mealsById.get(source.id)?.name ?? 'This meal'),
        )
      : null;

  return (
    <>
      {stock && (
        <ActionRow
          isGrouped
          icon={getIcon(stock)}
          label={getStockTitle(stock)}
          subtitle={sourcesText ?? getStockDetail(stock)}
          onClick={onOpenStock}
        />
      )}
      <ActionRow
        isGrouped
        icon={<PackagePlus className='h-4 w-4' />}
        label='Put some away'
        subtitle='Fridge or freezer, with an eat-by date'
        isDisabled={!isReady}
        onClick={onPutAway}
      />
    </>
  );
}

export default StockRows;
