import { useEffect, useRef, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import { PillGroup } from '@/components/PillGroup';
import { useAppDispatch, useAppSelector } from '@/store';
import { toLocalDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import ItemSearch from '@apps/pinch/components/plan/ItemSearch';
import { ShoppingPick } from '@apps/pinch/components/shared/AddToShoppingSheet';
import {
  DEFAULT_SERVING,
  SHOPPING_ADD_MODE_LABELS,
  SHOPPING_ADD_MODES,
  SOFT_MAX_SHOPPING_ITEMS,
  type ShoppingAddMode,
} from '@apps/pinch/constants';
import { addToShoppingList } from '@apps/pinch/store/actions/shoppingActions';
import {
  selectIngredientsById,
  selectPlannedByDay,
  selectShoppingById,
  selectShoppingLoadError,
} from '@apps/pinch/store/selectors';
import { addDaysToKey } from '@apps/pinch/utils/dayKeys';
import { getShoppingItemId } from '@apps/pinch/utils/shopping';

const PLAN_DAYS = 7;

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
  const plannedByDay = useAppSelector(selectPlannedByDay);
  const [todayKey] = useState(() => toLocalDateInputValue(Date.now()));
  const [mode, setMode] = useState<ShoppingAddMode>('one');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);

  const hasPlan = [...plannedByDay.keys()].some((dayKey) => dayKey >= todayKey);
  const shownMode = hasPlan ? mode : 'one';
  const isReady = isLoaded && loadError === null;
  const getNote = () => {
    if (loadError !== null)
      return "Your list couldn't load, so adding is paused.";
    if (!isLoaded) return 'Loading your list…';
    return isAdding ? 'Adding…' : null;
  };
  const note = getNote();

  // The drawer takes focus itself while it slides in, so the field is focused once that settles.
  useEffect(() => {
    const timer = window.setTimeout(
      () => fieldRef.current?.querySelector('input')?.focus(),
      350,
    );
    return () => window.clearTimeout(timer);
  }, []);

  const handleModeChange = (next: ShoppingAddMode) => {
    setMode(next);
    if (next === 'one') {
      window.setTimeout(
        () => fieldRef.current?.querySelector('input')?.focus(),
        0,
      );
    }
  };

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
    <FormSheet isOpen onClose={onClose} title='Shopping list'>
      <div className='space-y-4'>
        {hasPlan && (
          <PillGroup
            label='What to add'
            options={SHOPPING_ADD_MODES.map((value) => ({
              value,
              label: SHOPPING_ADD_MODE_LABELS[value],
            }))}
            value={shownMode}
            onChange={handleModeChange}
            isThin
          />
        )}
        {shownMode === 'plan' ? (
          <ShoppingPick
            uid={uid}
            request={{
              kind: 'range',
              startKey: todayKey,
              endKey: addDaysToKey(todayKey, PLAN_DAYS - 1),
            }}
            onClose={onClose}
            columnClassName='max-h-[max(12rem,calc(92dvh-19rem))]'
            hasViewAction={false}
          />
        ) : (
          <div className='space-y-3 pb-4'>
            <p className='text-muted-foreground text-sm'>
              What do you need? It goes on the list at a typical serving, and a
              tap on its row changes how much.
            </p>
            <div ref={fieldRef}>
              <ItemSearch
                uid={uid}
                isDisabled={isAdding || !isReady}
                resultsClassName='max-h-[max(12rem,calc(92dvh-22rem))] overflow-y-auto'
                onPick={(ingredientId) => void handlePick(ingredientId)}
              />
            </div>
            {note && (
              <p className='text-muted-foreground text-sm' role='status'>
                {note}
              </p>
            )}
            {error && <p className='text-destructive text-sm'>{error}</p>}
          </div>
        )}
      </div>
    </FormSheet>
  );
}

export default ShoppingAddSheet;
