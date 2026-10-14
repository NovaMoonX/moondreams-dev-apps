import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import ItemSearch from '@apps/pinch/components/plan/ItemSearch';
import {
  DEFAULT_SERVING,
  SOFT_MAX_SHOPPING_ITEMS,
} from '@apps/pinch/constants';
import { addToShoppingList } from '@apps/pinch/store/actions/shoppingActions';
import {
  selectIngredientsById,
  selectShoppingById,
  selectShoppingLoadError,
} from '@apps/pinch/store/selectors';
import { getShoppingItemId } from '@apps/pinch/utils/shopping';

interface ShoppingAddSheetProps {
  uid: string;
  onClose: () => void;
}

function ShoppingAddSheet({ uid, onClose }: ShoppingAddSheetProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const ingredientsById = useAppSelector(selectIngredientsById);
  const onList = useAppSelector(selectShoppingById);
  const loadError = useAppSelector(selectShoppingLoadError);
  const isLoaded = useAppSelector((state) => state.pinch.shopping.isLoaded);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const isReady = isLoaded && loadError === null;
  const getNote = () => {
    if (loadError !== null)
      return "Your list couldn't load, so adding is paused.";
    if (!isLoaded) return 'Loading your list…';
    return isAdding ? 'Adding…' : null;
  };
  const note = getNote();

  const handlePick = async (ingredientId: string) => {
    if (isAdding || !isReady) {
      return;
    }
    const ingredient = ingredientsById.get(ingredientId);
    const serving = ingredient?.serving ?? DEFAULT_SERVING;
    const isNewLine = !onList.has(
      getShoppingItemId(ingredientId, serving.unit),
    );
    if (isNewLine && onList.size >= SOFT_MAX_SHOPPING_ITEMS) {
      setError(
        "Your list is full: take something off or clear what you've got.",
      );
      return;
    }

    setError(null);
    setIsAdding(true);
    try {
      await dispatch(
        addToShoppingList({
          uid,
          lines: [
            {
              ingredientId,
              amount: serving.amount,
              unit: serving.unit,
            },
          ],
        }),
      ).unwrap();
      onClose();
      addToast({
        title: ingredient ? `Added ${ingredient.name}` : 'Added to your list',
        type: 'success',
      });
    } catch (addError) {
      setError(getErrorMessage(addError, 'Unable to add this to your list.'));
      setIsAdding(false);
    }
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Add to shopping list'>
      <div className='space-y-3 pb-4'>
        <p className='text-muted-foreground text-sm'>
          What do you need? It goes on the list at a typical serving, and a tap
          on its row changes how much.
        </p>
        <ItemSearch
          uid={uid}
          autoFocus
          isDisabled={isAdding || !isReady}
          resultsClassName='max-h-[max(12rem,calc(92dvh-22rem))] overflow-y-auto'
          onPick={(ingredientId) => void handlePick(ingredientId)}
        />
        {note && (
          <p className='text-muted-foreground text-sm' role='status'>
            {note}
          </p>
        )}
        {error && <p className='text-destructive text-sm'>{error}</p>}
      </div>
    </FormSheet>
  );
}

export default ShoppingAddSheet;
