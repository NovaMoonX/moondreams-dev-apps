import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import PackageFields, {
  type PackageFieldValues,
} from '@apps/pinch/components/pantry/PackageFields';
import { usePackageActions } from '@apps/pinch/hooks/usePackageActions';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectDefaultProducts,
  selectIngredientsById,
  selectLeadDays,
  selectPackagesByIngredient,
} from '@apps/pinch/store/selectors';
import type { ShoppingItem, Unit } from '@apps/pinch/types';
import {
  NO_DATE_ANSWER,
  formatKitchenTotal,
  getAnswerDate,
  getDefaultPlace,
  getStockSummaryParts,
  getStockView,
  isValidPackageAmount,
  parseAmountText,
} from '@apps/pinch/utils/packages';
import { getShopSection } from '@apps/pinch/utils/shopping';

/** One thing from the ticked part of the shopping list: its ingredient, and what the list said of it. */
export interface PutAwayRow {
  id: string;
  ingredientId: string;
  name: string;
  items: Pick<ShoppingItem, 'id' | 'updatedAt'>[];
  /** What the list said to buy; null for a line that is just the name. */
  amount: number | null;
  unit: Unit;
}

interface PantryFromShoppingSheetProps {
  uid: string;
  rows: PutAwayRow[];
  /** Called with the lines that were added, so the list can stop offering them. */
  onAdded: (items: PutAwayRow['items']) => void;
  onClose: () => void;
}

/** One ticked line at a time: how much came home, where it goes and until when, with "Skip for now" always there. Nothing is required, and the shopping rows keep working as they always did. */
function PantryFromShoppingSheet({
  uid,
  rows,
  onAdded,
  onClose,
}: PantryFromShoppingSheetProps) {
  const { addToast } = useToast();
  const { isBelow } = useMediaQuery();
  const { openSubviewFromToast } = usePinchOverlay();
  const { add, isReady, loadError } = usePackageActions(uid);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const defaultProducts = useAppSelector(selectDefaultProducts);
  const byIngredient = useAppSelector(selectPackagesByIngredient);
  const soonDays = useAppSelector(selectLeadDays);
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, PackageFieldValues>>({});
  const [addedCount, setAddedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const row = rows[index];
  const ingredient = ingredientsById.get(row.ingredientId);
  const product = defaultProducts.get(row.ingredientId);
  const isLast = index + 1 >= rows.length;
  const current: PackageFieldValues = values[row.id] ?? {
    amountText: String(product?.sizeAmount ?? ''),
    unit: product?.sizeUnit ?? row.unit,
    place: getDefaultPlace(getShopSection(ingredient)),
    date: NO_DATE_ANSWER,
  };
  const amount = parseAmountText(current.amountText);
  const answer = getAnswerDate(current.date);
  const stock = byIngredient.get(row.ingredientId) ?? [];

  const getNote = () => {
    if (loadError !== null)
      return "Your pantry couldn't load, so adding is paused.";
    if (!isReady) return 'Loading your pantry…';
    if (!isValidPackageAmount(amount)) return 'Say how much there is.';
    return answer.isAnswered
      ? null
      : 'Choose when it expires, or pick No date.';
  };
  const note = getNote();

  const finish = (added: number) => {
    onClose();
    if (added === 0) return;

    addToast({
      title:
        added === 1
          ? 'Added 1 thing to your pantry'
          : `Added ${added} things to your pantry`,
      type: 'success',
      action: {
        label: 'View',
        onClick: () => openSubviewFromToast({ kind: 'pantry' }),
      },
    });
  };

  const advance = (added: number) => {
    setError(null);
    if (isLast) {
      finish(added);
      return;
    }
    setIndex(index + 1);
  };

  const handleSave = () => {
    if (note !== null || !ingredient) return;

    setError(null);
    try {
      add(
        [
          {
            ingredientId: row.ingredientId,
            ingredientName: ingredient.name,
            productId: product?.id ?? null,
            amount,
            unit: current.unit,
            place: current.place,
            expiresAt: answer.expiresAt,
          },
        ],
        { onWriteFailed: setError },
      );
      onAdded(row.items);
      setAddedCount(addedCount + 1);
      advance(addedCount + 1);
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this.'));
    }
  };

  return (
    <FormSheet isOpen onClose={() => finish(addedCount)} title='Pantry'>
      <div className='grid gap-4'>
        <div>
          <div className='flex items-center gap-3'>
            <p className='min-w-0 flex-1 truncate text-lg font-medium'>
              {row.name}
            </p>
            {rows.length > 1 && (
              <span className='text-muted-foreground text-sm whitespace-nowrap'>
                {index + 1} of {rows.length}
              </span>
            )}
          </div>
          <p className='text-muted-foreground text-sm wrap-break-word'>
            {[
              row.amount === null
                ? 'On your list'
                : `On your list: ${formatKitchenTotal({ amount: row.amount, unit: row.unit })}`,
              stock.length > 0
                ? `Already in your pantry: ${getStockSummaryParts(getStockView(row.ingredientId, stock, undefined, soonDays)).join(', ')}`
                : null,
            ]
              .filter((part) => part !== null)
              .join('. ')}
          </p>
        </div>
        <PackageFields
          value={current}
          onChange={(next) =>
            setValues((known) => ({ ...known, [row.id]: next }))
          }
          name={row.name}
          amountLabel='How much did you buy?'
        />
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        <ModalFooterActions
          note={note}
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={() => advance(addedCount)}
            >
              {isLast || isBelow('sm') ? 'Skip' : 'Skip for now'}
            </Button>
          }
          rightActions={
            <Button type='button' disabled={note !== null} onClick={handleSave}>
              {isLast ? 'Save' : 'Save and next'}
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default PantryFromShoppingSheet;
