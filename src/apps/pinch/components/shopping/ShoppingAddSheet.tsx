import { useRef, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import ItemSearch from '@apps/pinch/components/plan/ItemSearch';
import { DEFAULT_SERVING } from '@apps/pinch/constants';
import { addToShoppingList } from '@apps/pinch/store/actions/shoppingActions';
import { selectIngredientsById } from '@apps/pinch/store/selectors';

interface ShoppingAddSheetProps {
  uid: string;
  onClose: () => void;
}

/** Search an ingredient and put it on the list at its serving size; how much is changed from its row afterwards. */
function ShoppingAddSheet({ uid, onClose }: ShoppingAddSheetProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [error, setError] = useState<string | null>(null);
  const isAdding = useRef(false);

  const handlePick = async (ingredientId: string) => {
    if (isAdding.current) {
      return;
    }
    isAdding.current = true;
    const ingredient = ingredientsById.get(ingredientId);
    const serving = ingredient?.serving ?? DEFAULT_SERVING;
    setError(null);
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
      isAdding.current = false;
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
          onPick={(ingredientId) => void handlePick(ingredientId)}
        />
        {error && <p className='text-destructive text-sm'>{error}</p>}
      </div>
    </FormSheet>
  );
}

export default ShoppingAddSheet;
