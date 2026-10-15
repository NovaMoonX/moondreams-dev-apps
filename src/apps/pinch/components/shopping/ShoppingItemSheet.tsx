import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Label,
} from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import DeleteIconButton from '@/components/DeleteIconButton';
import { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import UnitSelect from '@apps/pinch/components/shared/UnitSelect';
import { updateShoppingItem } from '@apps/pinch/store/actions/shoppingActions';
import { selectShoppingById } from '@apps/pinch/store/selectors';
import type { ShoppingItem, Unit } from '@apps/pinch/types';
import { formatSize } from '@apps/pinch/utils/productFormat';
import {
  getShoppingItemId,
  isValidAmount,
  roundAmount,
  sumShopAmounts,
} from '@apps/pinch/utils/shopping';

const { custom } = FormFactories;

interface ShoppingItemSheetProps {
  uid: string;
  name: string;
  /** What put it on the list ("Adobo chicken (Thu)"), or null when nothing behind it still resolves. */
  forText: string | null;
  /** The stored items one row of the list stands for, largest first. */
  items: ShoppingItem[];
  onClose: () => void;
  /** Takes the row off at once; the list offers an Undo. */
  onRemove: () => void;
}

function ShoppingItemSheet({
  uid,
  name,
  forText,
  items,
  onClose,
  onRemove,
}: ShoppingItemSheetProps) {
  const dispatch = useAppDispatch();
  const itemsById = useAppSelector(selectShoppingById);
  const [item] = items;
  const [shown] = useState(
    () => sumShopAmounts(items) ?? { amount: item.amount, unit: item.unit },
  );
  const [amountText, setAmountText] = useState(
    shown.amount === null ? '' : String(shown.amount),
  );
  const [unit, setUnit] = useState<Unit>(shown.unit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rowIds = items.map((rowItem) => rowItem.id);
  const amount =
    amountText.trim() === '' ? null : roundAmount(Number(amountText));
  const isValid = amount !== null && isValidAmount(amount);
  const isChanged = amount !== shown.amount || unit !== shown.unit;
  const newUnitId = getShoppingItemId(item.ingredientId, unit);
  const inNewUnit = rowIds.includes(newUnitId)
    ? undefined
    : itemsById.get(newUnitId);

  const getNote = () => {
    if (!inNewUnit) {
      const amounts = items.flatMap((rowItem) =>
        rowItem.amount === null
          ? []
          : [formatSize(rowItem.amount, rowItem.unit)],
      );
      return amounts.length > 1
        ? `On your list as ${amounts.join(' and ')}. Saving keeps one amount.`
        : null;
    }
    const there =
      inNewUnit.amount === null
        ? name
        : formatSize(inNewUnit.amount, inNewUnit.unit);
    if (!inNewUnit.isChecked) {
      return `You already have ${there} on your list. This adds to it.`;
    }
    return isValid
      ? `You already got ${there}. This puts it back on your list at ${formatSize(amount, unit)}.`
      : `You already got ${there}. This puts it back on your list.`;
  };

  const fields = useMemo(
    () => [
      custom({
        name: 'amount',
        label: '',
        renderComponent: () => (
          <div className='space-y-1'>
            <Label className='text-muted-foreground text-xs'>How much</Label>
            <div className='flex items-center gap-2'>
              <Input
                type='number'
                inputMode='decimal'
                min={0}
                step='any'
                variant='outline'
                aria-label={`Amount of ${name}`}
                className={join(COMPACT_INPUT_CLASS, 'min-w-0')}
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
              />
              <UnitSelect
                value={unit}
                className='w-24 shrink-0'
                triggerClassName='h-10! py-0!'
                onChange={setUnit}
              />
            </div>
          </div>
        ),
      }),
    ],
    [name, amountText, unit],
  );

  const handleSubmit = async () => {
    if (!isValid || !isChanged) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(
        updateShoppingItem({
          uid,
          item,
          mergedIds: rowIds.slice(1),
          amount,
          unit,
        }),
      ).unwrap();
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this change.'));
      setIsSubmitting(false);
    }
  };

  return (
    <FormSheet isOpen onClose={onClose} title={name}>
      {forText && (
        <p className='text-muted-foreground mb-3 text-sm wrap-break-word'>
          For {forText}
        </p>
      )}
      <Form
        id='pinch-shopping-item'
        form={fields}
        initialData={{ amount: '' }}
        columns={1}
        onSubmit={() => {
          void handleSubmit();
        }}
        submitButton={
          <ModalFooterActions
            note={getNote()}
            leftActions={
              <DeleteIconButton
                label='Remove'
                onClick={onRemove}
                disabled={isSubmitting}
              />
            }
            cancelAction={
              <Button
                type='button'
                variant='secondary'
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='submit'
                loading={isSubmitting}
                disabled={isSubmitting || !isValid || !isChanged}
              >
                Save
              </Button>
            }
          />
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </FormSheet>
  );
}

export default ShoppingItemSheet;
