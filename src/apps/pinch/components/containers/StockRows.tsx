import ActionRow from '@/components/ActionRow';
import { useAppSelector } from '@/store';
import { CONTAINER_EMOJI, CONTAINER_PLACE_EMOJIS } from '@apps/pinch/constants';
import { useContainerActions } from '@apps/pinch/hooks/useContainerActions';
import {
  selectStockByMeal,
  selectStockByRecipe,
} from '@apps/pinch/store/selectors';
import { getStockDetail, getStockTitle } from '@apps/pinch/utils/containers';

interface StockRowsProps {
  uid: string;
  target: { kind: 'recipe' | 'meal'; id: string };
  onOpenStock: () => void;
  onPutAway: () => void;
}

function StockRows({ uid, target, onOpenStock, onPutAway }: StockRowsProps) {
  const stock = useAppSelector((state) =>
    target.kind === 'recipe'
      ? selectStockByRecipe(state).get(target.id)
      : selectStockByMeal(state).get(target.id),
  );
  const { isReady, loadError } = useContainerActions(uid);

  if (loadError !== null) {
    return null;
  }

  return (
    <>
      {stock && (
        <ActionRow
          isGrouped
          icon={
            <span className='text-base leading-none'>
              {stock.fridge > 0 && stock.freezer === 0
                ? CONTAINER_PLACE_EMOJIS.FRIDGE
                : stock.freezer > 0 && stock.fridge === 0
                  ? CONTAINER_PLACE_EMOJIS.FREEZER
                  : CONTAINER_EMOJI}
            </span>
          }
          label={getStockTitle(stock)}
          subtitle={getStockDetail(stock)}
          onClick={onOpenStock}
        />
      )}
      <ActionRow
        isGrouped
        icon={<span className='text-base leading-none'>{CONTAINER_EMOJI}</span>}
        label='Put some away'
        subtitle='Fridge or freezer, with an eat-by date'
        isDisabled={!isReady}
        onClick={onPutAway}
      />
    </>
  );
}

export default StockRows;
