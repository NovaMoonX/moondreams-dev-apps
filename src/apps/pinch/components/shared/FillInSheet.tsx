import { useMemo, useState } from 'react';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import MoneyInput from '@/components/MoneyInput';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { parseMoneyToCents } from '@/utils/moneyUtils';
import StorePicker from '@apps/pinch/components/kitchen/StorePicker';
import IngredientIcon from '@apps/pinch/components/shared/IngredientIcon';
import UnitSelect from '@apps/pinch/components/shared/UnitSelect';
import { MAX_PRICE_CENTS, MAX_SERVING_AMOUNT } from '@apps/pinch/constants';
import { saveProduct } from '@apps/pinch/store/actions/productActions';
import {
  selectDefaultProducts,
  selectIngredientsById,
  selectProducts,
  selectStoresById,
} from '@apps/pinch/store/selectors';
import type { Gap, Product, Unit } from '@apps/pinch/types';
import { formatSize } from '@apps/pinch/utils/productFormat';

interface RowState {
  storeId: string | null;
  price: string;
  sizeAmount: string;
  sizeUnit: Unit;
}

interface FillInSheetProps {
  uid: string;
  gaps: Gap[];
  onClose: () => void;
}

const isBlank = (row: RowState) =>
  row.price.trim() === '' && row.sizeAmount.trim() === '';

function FillInSheet({ uid, gaps, onClose }: FillInSheetProps) {
  const dispatch = useAppDispatch();
  const ingredientsById = useAppSelector(selectIngredientsById);
  const defaultProducts = useAppSelector(selectDefaultProducts);
  const storesById = useAppSelector(selectStoresById);
  const products = useAppSelector(selectProducts);
  const lastStoreId = useMemo(
    () =>
      [...products]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .find((product) => storesById.has(product.storeId))?.storeId ?? null,
    [products, storesById],
  );
  const rows = useMemo(
    () => [...new Map(gaps.map((gap) => [gap.ingredientId, gap])).values()],
    [gaps],
  );
  const [values, setValues] = useState<Record<string, RowState>>({});
  const [index, setIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRow = (gap: Gap): RowState =>
    values[gap.ingredientId] ?? {
      storeId: lastStoreId,
      price: '',
      sizeAmount: '',
      sizeUnit: 'LB',
    };
  const update = (id: string, gap: Gap, patch: Partial<RowState>) =>
    setValues((current) => ({
      ...current,
      [id]: { ...getRow(gap), ...current[id], ...patch },
    }));

  const getDraft = (gap: Gap, row: RowState) => {
    const sizeAmount =
      row.sizeAmount.trim() === '' ? null : Number(row.sizeAmount);
    const hasSize =
      sizeAmount !== null &&
      Number.isFinite(sizeAmount) &&
      sizeAmount > 0 &&
      sizeAmount <= MAX_SERVING_AMOUNT;
    if (!hasSize) return null;
    if (gap.kind === 'NOT_COMPARABLE') {
      const product = defaultProducts.get(gap.ingredientId);
      return product
        ? {
            id: product.id,
            ingredientId: gap.ingredientId,
            storeId: product.storeId,
            label: product.label,
            priceCents: product.priceCents,
            sizeAmount,
            sizeUnit: row.sizeUnit,
            url: product.url,
            makeDefault: true,
          }
        : null;
    }
    const priceCents = parseMoneyToCents(row.price);
    if (
      priceCents === null ||
      priceCents > MAX_PRICE_CENTS ||
      row.storeId === null ||
      !storesById.has(row.storeId)
    )
      return null;
    return {
      id: null,
      ingredientId: gap.ingredientId,
      storeId: row.storeId,
      label: null,
      priceCents,
      sizeAmount,
      sizeUnit: row.sizeUnit,
      url: null,
      makeDefault: true,
    };
  };

  const gap = rows[index];
  const ingredient = ingredientsById.get(gap.ingredientId);
  const row = getRow(gap);
  const product: Product | undefined = defaultProducts.get(gap.ingredientId);
  const name = ingredient?.name ?? 'Removed ingredient';
  const draft = getDraft(gap, row);
  const isLast = index + 1 >= rows.length;

  const advance = () => {
    setError(null);
    if (isLast) {
      onClose();
      return;
    }
    setIndex(index + 1);
  };

  const handleSave = async () => {
    if (draft === null) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(saveProduct({ uid, draft })).unwrap();
      setIsSubmitting(false);
      advance();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save these details.'));
      setIsSubmitting(false);
    }
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Prices and sizes'>
      <div className='grid gap-4'>
        <div className='flex items-center gap-3'>
          <IngredientIcon iconKey={ingredient?.iconKey ?? null} size={32} />
          <p className='min-w-0 flex-1 truncate text-lg font-medium'>{name}</p>
          {rows.length > 1 && (
            <span className='text-muted-foreground text-sm whitespace-nowrap'>
              {index + 1} of {rows.length}
            </span>
          )}
        </div>
        {gap.kind === 'NO_PRODUCT' && (
          <StorePicker
            uid={uid}
            value={row.storeId}
            onChange={(storeId) => update(gap.ingredientId, gap, { storeId })}
          />
        )}
        {gap.kind === 'NOT_COMPARABLE' && product && (
          <p className='text-muted-foreground text-sm'>
            It's set up as a {formatSize(product.sizeAmount, product.sizeUnit)}{' '}
            package, which can't be compared with the amounts in your recipes.
            How big is it, in something you'd measure by weight or volume?
          </p>
        )}
        <div
          className={
            gap.kind === 'NO_PRODUCT'
              ? 'grid grid-cols-[1fr_1.4fr] items-start gap-3'
              : ''
          }
        >
          {gap.kind === 'NO_PRODUCT' && (
            <div className='space-y-1.5'>
              <Label>Price</Label>
              <MoneyInput
                ariaLabel={`Price of ${name}`}
                placeholder='9.48'
                value={row.price}
                onChange={(price) => update(gap.ingredientId, gap, { price })}
              />
            </div>
          )}
          <div className='space-y-1.5'>
            <Label>Package size</Label>
            <div className='flex items-center gap-2'>
              <Input
                type='number'
                inputMode='decimal'
                min={0}
                step='any'
                variant='outline'
                aria-label={`Package size of ${name}`}
                placeholder='3'
                className='min-w-0'
                value={row.sizeAmount}
                onChange={(event) =>
                  update(gap.ingredientId, gap, {
                    sizeAmount: event.target.value,
                  })
                }
              />
              <UnitSelect
                value={row.sizeUnit}
                className='w-20 shrink-0'
                onChange={(sizeUnit) =>
                  update(gap.ingredientId, gap, { sizeUnit })
                }
              />
            </div>
          </div>
        </div>
        {!isBlank(row) && draft === null && (
          <p className='text-muted-foreground text-sm'>
            {gap.kind === 'NO_PRODUCT'
              ? 'Add a store, a price and a size to save this one.'
              : 'Add a size to save this one.'}
          </p>
        )}
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={advance}
              disabled={isSubmitting}
            >
              {isLast ? 'Skip' : 'Skip for now'}
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={isSubmitting}
              disabled={isSubmitting || draft === null}
              onClick={() => void handleSave()}
            >
              {isLast ? 'Save' : 'Save and next'}
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default FillInSheet;
