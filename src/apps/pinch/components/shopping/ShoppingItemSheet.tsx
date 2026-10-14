import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Label,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import DeleteIconButton from '@/components/DeleteIconButton';
import { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import UnitSelect from '@apps/pinch/components/shared/UnitSelect';
import {
  removeShoppingItem,
  updateShoppingItem,
} from '@apps/pinch/store/actions/shoppingActions';
import {
  selectIngredientsById,
  selectShoppingById,
} from '@apps/pinch/store/selectors';
import type { ShoppingItem, Unit } from '@apps/pinch/types';
import { formatSize } from '@apps/pinch/utils/productFormat';
import {
  getShoppingItemId,
  isValidAmount,
  roundAmount,
} from '@apps/pinch/utils/shopping';

const { custom } = FormFactories;

interface ShoppingItemSheetProps {
  uid: string;
  item: ShoppingItem;
  onClose: () => void;
}

function ShoppingItemSheet({ uid, item, onClose }: ShoppingItemSheetProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const ingredientsById = useAppSelector(selectIngredientsById);
  const itemsById = useAppSelector(selectShoppingById);
  const [amountText, setAmountText] = useState(String(item.amount));
  const [unit, setUnit] = useState<Unit>(item.unit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name =
    ingredientsById.get(item.ingredientId)?.name ?? 'Removed ingredient';
  const amount =
    amountText.trim() === '' ? null : roundAmount(Number(amountText));
  const isValid = amount !== null && isValidAmount(amount);
  const isChanged = amount !== item.amount || unit !== item.unit;
  const inNewUnit =
    unit === item.unit
      ? undefined
      : itemsById.get(getShoppingItemId(item.ingredientId, unit));

  const getNote = () => {
    if (!inNewUnit) return null;
    const there = formatSize(inNewUnit.amount, inNewUnit.unit);
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
      await dispatch(updateShoppingItem({ uid, item, amount, unit })).unwrap();
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this change.'));
      setIsSubmitting(false);
    }
  };

  const handleRemove = async () => {
    const confirmed = await confirm({
      title: 'Remove from your list',
      message: `Take ${name} off your shopping list?`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(removeShoppingItem({ uid, id: item.id })).unwrap();
      onClose();
    } catch (removeError) {
      setError(
        getErrorMessage(removeError, 'Unable to take this off your list.'),
      );
      setIsSubmitting(false);
    }
  };

  return (
    <FormSheet isOpen onClose={onClose} title={name}>
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
                onClick={() => void handleRemove()}
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
