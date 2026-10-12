import { useMemo, useState } from 'react';

import { Button, Checkbox, Form, FormFactories, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Link2, Tag } from 'lucide-react';

import DeleteIconButton from '@/components/DeleteIconButton';
import AddFieldChips, { RemovableField } from '@/components/forms/AddFieldChips';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import MoneyInput from '@/components/MoneyInput';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { centsToInputValue, parseMoneyToCents } from '@/utils/moneyUtils';
import { isValidHttpUrl } from '@/utils/urlUtils';
import StorePicker from '@apps/pinch/components/kitchen/StorePicker';
import IngredientIcon from '@apps/pinch/components/shared/IngredientIcon';
import UnitSelect from '@apps/pinch/components/shared/UnitSelect';
import { MAX_NAME_LENGTH, MAX_PRICE_CENTS, MAX_SERVING_AMOUNT } from '@apps/pinch/constants';
import { removeProduct, saveProduct } from '@apps/pinch/store/actions/productActions';
import { selectProductsByIngredient } from '@apps/pinch/store/selectors';
import type { Product, ResolvedIngredient, Unit } from '@apps/pinch/types';

const { custom } = FormFactories;

interface Reveal<T> {
  enabled: boolean;
  value: T;
}

interface Extras {
  label: Reveal<string>;
  link: Reveal<string>;
}

interface FormData {
  storeId: string | null;
  price: string;
  sizeAmount: string;
  sizeUnit: Unit;
  makeDefault: boolean;
  extras: Extras;
}

const getInitialData = (product: Product | null): FormData => ({
  storeId: product?.storeId ?? null,
  price: centsToInputValue(product?.priceCents ?? null),
  sizeAmount: product ? String(product.sizeAmount) : '',
  sizeUnit: product?.sizeUnit ?? 'LB',
  makeDefault: false,
  extras: {
    label: { enabled: product?.label != null, value: product?.label ?? '' },
    link: { enabled: product?.url != null, value: product?.url ?? '' },
  },
});

interface ExtrasFieldsProps {
  extras: Extras;
  onChange: (extras: Extras) => void;
}

function ExtrasFields({ extras, onChange }: ExtrasFieldsProps) {
  const chips = [
    { key: 'label', label: 'Label', icon: <Tag className='h-4 w-4' /> },
    { key: 'link', label: 'Link', icon: <Link2 className='h-4 w-4' /> },
  ].filter((chip) => !extras[chip.key as keyof Extras].enabled);

  return (
    <div className='space-y-4'>
      {extras.label.enabled && (
        <RemovableField label='Label' removeLabel='Remove label' onRemove={() => onChange({ ...extras, label: { enabled: false, value: '' } })}>
          <Input
            variant='outline'
            placeholder='Great Value'
            maxLength={MAX_NAME_LENGTH}
            value={extras.label.value}
            onChange={(event) => onChange({ ...extras, label: { enabled: true, value: event.target.value } })}
          />
        </RemovableField>
      )}
      {extras.link.enabled && (
        <RemovableField label='Link' removeLabel='Remove link' onRemove={() => onChange({ ...extras, link: { enabled: false, value: '' } })}>
          <Input
            variant='outline'
            type='url'
            placeholder='https://'
            value={extras.link.value}
            onChange={(event) => onChange({ ...extras, link: { enabled: true, value: event.target.value } })}
          />
        </RemovableField>
      )}
      <AddFieldChips chips={chips} onAdd={(key) => onChange({ ...extras, [key]: { ...extras[key as keyof Extras], enabled: true } })} />
    </div>
  );
}

interface ProductFormSheetProps {
  uid: string;
  ingredient: ResolvedIngredient;
  /** The product being changed; null adds a new one. */
  product: Product | null;
  onClose: () => void;
}

function ProductFormSheet({ uid, ingredient, product, onClose }: ProductFormSheetProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const otherCount = (useAppSelector(selectProductsByIngredient).get(ingredient.id) ?? []).filter((candidate) => candidate.id !== product?.id).length;
  const initialData = useMemo(() => getInitialData(product), [product]);
  const [formData, setFormData] = useState<FormData>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceCents = parseMoneyToCents(formData.price);
  const sizeAmount = formData.sizeAmount.trim() === '' ? null : Number(formData.sizeAmount);
  const link = formData.extras.link;
  const isFormComplete =
    formData.storeId !== null &&
    priceCents !== null &&
    priceCents <= MAX_PRICE_CENTS &&
    sizeAmount !== null &&
    Number.isFinite(sizeAmount) &&
    sizeAmount > 0 &&
    sizeAmount <= MAX_SERVING_AMOUNT &&
    (!link.enabled || link.value.trim() === '' || isValidHttpUrl(link.value.trim()));

  const fields = useMemo(
    () => [
      custom({
        name: 'storeId',
        label: 'Where do you buy it?',
        renderComponent: (props) => (
          <StorePicker uid={uid} value={props.value as string | null} onChange={(storeId) => props.onValueChange(storeId)} />
        ),
      }),
      custom({
        name: 'price',
        label: '',
        renderComponent: () => (
          <div className='grid grid-cols-2 items-start gap-3'>
            <div className='space-y-1.5'>
              <Label>Price</Label>
              <MoneyInput
                ariaLabel='Price'
                placeholder='9.48'
                value={formData.price}
                onChange={(price) => setFormData((current) => ({ ...current, price }))}
              />
            </div>
            <div className='space-y-1.5'>
              <Label>Package size</Label>
              <div className='flex items-center gap-2'>
                <Input
                  type='number'
                  inputMode='decimal'
                  min={0}
                  step='any'
                  variant='outline'
                  aria-label='Package size'
                  placeholder='3'
                  className='min-w-0'
                  value={formData.sizeAmount}
                  onChange={(event) => setFormData((current) => ({ ...current, sizeAmount: event.target.value }))}
                />
                <UnitSelect
                  value={formData.sizeUnit}
                  className='w-24 shrink-0'
                  onChange={(sizeUnit) => setFormData((current) => ({ ...current, sizeUnit }))}
                />
              </div>
            </div>
          </div>
        ),
      }),
      custom({
        name: 'extras',
        label: '',
        renderComponent: (props) => <ExtrasFields extras={props.value as Extras} onChange={props.onValueChange} />,
      }),
      ...(otherCount > 0
        ? [
            custom({
              name: 'makeDefault',
              label: '',
              renderComponent: (props) => (
                <div className='flex items-center gap-3'>
                  <Checkbox
                    aria-label='Make this the default'
                    checked={props.value === true}
                    onCheckedChange={(checked) => props.onValueChange(checked === true)}
                  />
                  <span className='text-sm font-medium'>Make this the default</span>
                </div>
              ),
            }),
          ]
        : []),
    ],
    [uid, otherCount, formData.price, formData.sizeAmount, formData.sizeUnit],
  );

  const handleDelete = async () => {
    if (!product) {
      return;
    }
    const confirmed = await confirm({
      title: 'Delete product',
      message: `Delete this ${ingredient.name} product? Recipes keep working: they only name the ingredient. This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(removeProduct({ uid, id: product.id })).unwrap();
      onClose();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this product.'));
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (data: FormData) => {
    if (data.storeId === null || priceCents === null || sizeAmount === null) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(
        saveProduct({
          uid,
          draft: {
            id: product?.id ?? null,
            ingredientId: ingredient.id,
            storeId: data.storeId,
            label: data.extras.label.enabled ? data.extras.label.value.trim() || null : null,
            priceCents,
            sizeAmount,
            sizeUnit: formData.sizeUnit,
            url: data.extras.link.enabled ? data.extras.link.value.trim() || null : null,
            makeDefault: data.makeDefault === true,
          },
        }),
      ).unwrap();
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this product.'));
      setIsSubmitting(false);
    }
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Product'>
      <div className='mb-4 flex items-center gap-3'>
        <IngredientIcon iconKey={ingredient.iconKey} size={36} />
        <div className='min-w-0'>
          <p className='text-muted-foreground text-xs'>For</p>
          <p className='truncate font-medium'>{ingredient.name}</p>
        </div>
      </div>
      <Form
        id='pinch-product'
        form={fields}
        initialData={initialData}
        columns={1}
        onDataChange={(data) =>
          setFormData((current) => ({ ...current, ...(data as FormData), price: current.price, sizeAmount: current.sizeAmount, sizeUnit: current.sizeUnit }))
        }
        onSubmit={(data) => {
          void handleSubmit(data as FormData);
        }}
        submitButton={
          <ModalFooterActions
            leftActions={product && <DeleteIconButton onClick={() => void handleDelete()} disabled={isSubmitting} />}
            cancelAction={
              <Button type='button' variant='secondary' onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
            }
            rightActions={
              <Button type='submit' loading={isSubmitting} disabled={isSubmitting || !isFormComplete}>
                {product ? 'Save' : 'Add'}
              </Button>
            }
          />
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </FormSheet>
  );
}

export default ProductFormSheet;
