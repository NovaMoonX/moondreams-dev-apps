import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Button,
  Checkbox,
  Form,
  FormFactories,
  Input,
  Label,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Link2, Tag } from 'lucide-react';

import DeleteIconButton from '@/components/DeleteIconButton';
import AddFieldChips, {
  RemovableField,
} from '@/components/forms/AddFieldChips';
import Field, { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import MoneyInput from '@/components/MoneyInput';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { centsToInputValue, parseMoneyToCents } from '@/utils/moneyUtils';
import { isValidHttpsUrl } from '@/utils/urlUtils';
import ProductLinkField from '@apps/pinch/components/kitchen/ProductLinkField';
import { useProductPageReading } from '@apps/pinch/components/kitchen/useProductPageReading';
import StorePicker from '@apps/pinch/components/kitchen/StorePicker';
import UnitSelect from '@apps/pinch/components/shared/UnitSelect';
import {
  MAX_LINK_URL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PRICE_CENTS,
  MAX_SERVING_AMOUNT,
} from '@apps/pinch/constants';
import { addIngredientAlias } from '@apps/pinch/store/actions/ingredientActions';
import {
  removeProduct,
  saveProduct,
} from '@apps/pinch/store/actions/productActions';
import {
  selectDefaultProducts,
  selectIngredientsById,
  selectPlannedMeals,
  selectProductsByIngredient,
  selectRecipes,
  selectRecipesById,
  selectStoresById,
} from '@apps/pinch/store/selectors';
import type { Product, ResolvedIngredient, Unit } from '@apps/pinch/types';
import { getIngredientUses } from '@apps/pinch/utils/gapOrder';

const { custom } = FormFactories;

// The field draws a 1px border around its input, so the input is 2px shorter to make the whole field 40px.
const MONEY_INPUT_CLASS = 'min-h-9.5 h-9.5 placeholder:text-sm';

import {
  formatPriceAndSize,
  formatRecipeUnitEcho,
} from '@apps/pinch/utils/productFormat';

interface Reveal<T> {
  enabled: boolean;
  value: T;
}

interface Extras {
  label: Reveal<string>;
}

interface FormData {
  storeId: string | null;
  price: string;
  sizeAmount: string;
  sizeUnit: Unit;
  makeDefault: boolean;
  link: Reveal<string>;
  extras: Extras;
}

const getInitialData = (product: Product | null): FormData => ({
  storeId: product?.storeId ?? null,
  price: centsToInputValue(product?.priceCents ?? null),
  sizeAmount: product ? String(product.sizeAmount) : '',
  sizeUnit: product?.sizeUnit ?? 'LB',
  makeDefault: false,
  link: {
    enabled: product === null || product.url != null,
    value: product?.url ?? '',
  },
  extras: {
    label: { enabled: product?.label != null, value: product?.label ?? '' },
  },
});

interface ExtrasFieldsProps {
  extras: Extras;
  onChange: (extras: Extras) => void;
  canAddLink: boolean;
  onAddLink: () => void;
}

function ExtrasFields({
  extras,
  onChange,
  canAddLink,
  onAddLink,
}: ExtrasFieldsProps) {
  const chips = [
    ...(extras.label.enabled
      ? []
      : [{ key: 'label', label: 'Label', icon: <Tag className='h-4 w-4' /> }]),
    ...(canAddLink
      ? [{ key: 'link', label: 'Link', icon: <Link2 className='h-4 w-4' /> }]
      : []),
  ];

  return (
    <div className='space-y-4'>
      {extras.label.enabled && (
        <RemovableField
          label='Label'
          removeLabel='Remove label'
          onRemove={() =>
            onChange({ ...extras, label: { enabled: false, value: '' } })
          }
        >
          <Input
            variant='outline'
            placeholder='Great Value'
            maxLength={MAX_NAME_LENGTH}
            value={extras.label.value}
            onChange={(event) =>
              onChange({
                ...extras,
                label: { enabled: true, value: event.target.value },
              })
            }
          />
        </RemovableField>
      )}
      <AddFieldChips
        chips={chips}
        onAdd={(key) =>
          key === 'link'
            ? onAddLink()
            : onChange({
                ...extras,
                label: { ...extras.label, enabled: true },
              })
        }
      />
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

function ProductFormSheet({
  uid,
  ingredient,
  product,
  onClose,
}: ProductFormSheetProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const otherCount = (
    useAppSelector(selectProductsByIngredient).get(ingredient.id) ?? []
  ).filter((candidate) => candidate.id !== product?.id).length;
  const isCurrentDefault = useAppSelector(
    (state) =>
      product !== null &&
      selectDefaultProducts(state).get(ingredient.id)?.id === product.id,
  );
  const storesById = useAppSelector(selectStoresById);
  const recipes = useAppSelector(selectRecipes);
  const recipesById = useAppSelector(selectRecipesById);
  const plannedMeals = useAppSelector(selectPlannedMeals);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [initialData, setInitialData] = useState(() => getInitialData(product));
  // The form reads its initial data once, so a reading that fills it remounts the form with the filled values.
  const [fillCount, setFillCount] = useState(0);
  const [formData, setFormData] = useState<FormData>(initialData);
  const [suggestedStore, setSuggestedStore] = useState<string | null>(null);
  const { reading, read, reset: resetReading } = useProductPageReading();
  const [aliasOffer, setAliasOffer] = useState<{
    text: string;
    isOn: boolean;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceCents = parseMoneyToCents(formData.price);
  const sizeAmount =
    formData.sizeAmount.trim() === '' ? null : Number(formData.sizeAmount);
  const link = formData.link;
  const priceRef = useRef<HTMLDivElement>(null);
  const latestFormData = useRef(formData);
  useEffect(() => {
    latestFormData.current = formData;
  }, [formData]);
  useEffect(() => {
    if (fillCount > 0) {
      priceRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [fillCount]);
  const use = getIngredientUses(
    recipes,
    plannedMeals,
    recipesById,
    ingredientsById,
  ).get(ingredient.id);
  const recipeUnit =
    [...(use?.recipes ?? []), ...(use?.planned ?? [])].sort(
      (a, b) => b.grams - a.grams,
    )[0]?.unit ?? null;
  const hasPriceAndSize =
    priceCents !== null &&
    priceCents > 0 &&
    sizeAmount !== null &&
    Number.isFinite(sizeAmount) &&
    sizeAmount > 0;
  const echo =
    recipeUnit !== null && hasPriceAndSize
      ? formatRecipeUnitEcho(
          { priceCents, sizeAmount, sizeUnit: formData.sizeUnit },
          recipeUnit,
          {
            gramsPerMl: ingredient.gramsPerMl,
            gramsEach: ingredient.gramsEach,
          },
        )
      : null;
  const isFormComplete =
    formData.storeId !== null &&
    storesById.has(formData.storeId) &&
    priceCents !== null &&
    priceCents <= MAX_PRICE_CENTS &&
    sizeAmount !== null &&
    Number.isFinite(sizeAmount) &&
    sizeAmount > 0 &&
    sizeAmount <= MAX_SERVING_AMOUNT &&
    (!link.enabled ||
      link.value.trim() === '' ||
      (isValidHttpsUrl(link.value.trim()) &&
        link.value.trim().length <= MAX_LINK_URL_LENGTH));

  const getBlocker = () => {
    if (formData.storeId === null || !storesById.has(formData.storeId)) {
      return 'Choose where you buy it.';
    }
    if (priceCents === null || priceCents > MAX_PRICE_CENTS) {
      return 'Add the price.';
    }
    if (sizeAmount === null || !(sizeAmount > 0)) {
      return 'Add the package size.';
    }
    return 'Start the link with https:// to keep it.';
  };

  const fillFromPage = useCallback(
    async (pageLink: string) => {
      const result = await read(pageLink, ingredient);
      if (result === null) {
        return;
      }

      const { found, match } = result;
      const formData = latestFormData.current;
      const hasSize = found.sizeAmount !== null && found.sizeUnit !== null;
      const next: FormData = {
        ...formData,
        storeId: match.storeId ?? formData.storeId,
        price:
          found.priceCents === null
            ? formData.price
            : centsToInputValue(found.priceCents),
        sizeAmount: hasSize ? String(found.sizeAmount) : formData.sizeAmount,
        sizeUnit: found.sizeUnit ?? formData.sizeUnit,
        link: { enabled: true, value: pageLink },
        extras: {
          label:
            found.label === null
              ? formData.extras.label
              : { enabled: true, value: found.label },
        },
      };
      setInitialData(next);
      setFormData(next);
      setFillCount((count) => count + 1);
      setSuggestedStore(match.storeId === null ? match.suggestedName : null);
      setAliasOffer(
        found.alias === null ? null : { text: found.alias, isOn: false },
      );
    },
    [read, ingredient],
  );

  const fields = useMemo(() => {
    const linkField = custom({
      name: 'link',
      label: '',
      renderComponent: () => {
        if (!link.enabled) {
          return null;
        }

        const field = (
          <ProductLinkField
            caption={product === null ? 'Start from a product page' : undefined}
            savedLink={product?.url ?? null}
            isEditing={product !== null}
            canClear={product === null}
            value={link.value}
            onChange={(value) => {
              resetReading();
              setAliasOffer(null);
              setFormData((current) => ({
                ...current,
                link: { enabled: true, value },
              }));
            }}
            onFill={(pageLink) => void fillFromPage(pageLink)}
            isFilling={reading.isFilling}
            note={reading.note}
            error={reading.error}
            aliasOffer={
              aliasOffer && {
                ...aliasOffer,
                onChange: (isOn) =>
                  setAliasOffer((current) => current && { ...current, isOn }),
              }
            }
          />
        );
        return product === null ? (
          field
        ) : (
          <RemovableField
            label='Link'
            removeLabel='Remove link'
            onRemove={() =>
              setFormData((current) => ({
                ...current,
                link: { enabled: false, value: '' },
              }))
            }
          >
            {field}
          </RemovableField>
        );
      },
    });

    return [
      ...(product === null ? [linkField] : []),
      custom({
        name: 'storeId',
        label: 'Where do you buy it?',
        renderComponent: (props) => (
          <StorePicker
            uid={uid}
            value={props.value as string | null}
            suggestedStoreName={suggestedStore}
            onChange={(storeId) => props.onValueChange(storeId)}
          />
        ),
      }),
      custom({
        name: 'price',
        label: '',
        renderComponent: () => (
          <div
            ref={priceRef}
            className='grid items-start gap-3 min-[400px]:grid-cols-2'
          >
            <Field label='Price' isCompact>
              {() => (
                <MoneyInput
                  variant='outline'
                  className={MONEY_INPUT_CLASS}
                  ariaLabel='Price'
                  placeholder='9.48'
                  value={formData.price}
                  onChange={(price) =>
                    setFormData((current) => ({ ...current, price }))
                  }
                />
              )}
            </Field>
            <div className='space-y-1'>
              <Label className='text-muted-foreground text-xs'>
                Package size
              </Label>
              <div className='flex items-center gap-2'>
                <Input
                  type='number'
                  inputMode='decimal'
                  min={0}
                  step='any'
                  variant='outline'
                  aria-label='Package size'
                  placeholder='3'
                  className={join(COMPACT_INPUT_CLASS, 'min-w-0')}
                  value={formData.sizeAmount}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      sizeAmount: event.target.value,
                    }))
                  }
                />
                <UnitSelect
                  value={formData.sizeUnit}
                  className='w-24 shrink-0'
                  triggerClassName='h-10! py-0!'
                  onChange={(sizeUnit) =>
                    setFormData((current) => ({ ...current, sizeUnit }))
                  }
                />
              </div>
            </div>
            {echo && (
              <p className='text-muted-foreground text-xs min-[400px]:col-span-2'>
                {echo}
              </p>
            )}
          </div>
        ),
      }),
      ...(product !== null ? [linkField] : []),
      custom({
        name: 'extras',
        label: '',
        renderComponent: (props) => (
          <ExtrasFields
            extras={props.value as Extras}
            onChange={props.onValueChange}
            canAddLink={product !== null && !link.enabled}
            onAddLink={() =>
              setFormData((current) => ({
                ...current,
                link: { enabled: true, value: current.link.value },
              }))
            }
          />
        ),
      }),
      ...(otherCount > 0 && !isCurrentDefault
        ? [
            custom({
              name: 'makeDefault',
              label: '',
              renderComponent: (props) => (
                <label className='flex min-h-10 cursor-pointer items-center gap-3 select-none'>
                  <Checkbox
                    aria-label='Make this the default'
                    checked={props.value === true}
                    onCheckedChange={(checked) =>
                      props.onValueChange(checked === true)
                    }
                  />
                  <span className='text-sm font-medium'>
                    Make this the default
                  </span>
                </label>
              ),
            }),
          ]
        : []),
    ];
  }, [
    uid,
    product,
    otherCount,
    isCurrentDefault,
    formData.price,
    formData.sizeAmount,
    formData.sizeUnit,
    echo,
    link,
    reading,
    aliasOffer,
    suggestedStore,
    fillFromPage,
    resetReading,
  ]);

  const handleDelete = async () => {
    if (!product) {
      return;
    }
    const confirmed = await confirm({
      title: 'Delete price',
      message: `Delete the price of ${ingredient.name} at ${storesById.get(product.storeId)?.name ?? 'a removed store'} (${formatPriceAndSize(product)})? Recipes keep working: they only name the ingredient. This action cannot be undone.`,
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
      setError(getErrorMessage(deleteError, 'Unable to delete this price.'));
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
            label: data.extras.label.enabled
              ? data.extras.label.value.trim() || null
              : null,
            priceCents,
            sizeAmount,
            sizeUnit: formData.sizeUnit,
            url: link.enabled ? link.value.trim() || null : null,
            makeDefault: data.makeDefault === true,
          },
        }),
      ).unwrap();
      if (aliasOffer?.isOn) {
        await dispatch(
          addIngredientAlias({
            uid,
            ingredientId: ingredient.id,
            alias: aliasOffer.text,
          }),
        )
          .unwrap()
          .catch((aliasError) =>
            console.error('Adding the other name failed', aliasError),
          );
      }
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this price.'));
      setIsSubmitting(false);
    }
  };

  const title = product
    ? `${ingredient.name} · price at ${storesById.get(product.storeId)?.name ?? 'a removed store'}`
    : `${ingredient.name} · new price`;

  return (
    <FormSheet isOpen onClose={onClose} title={title}>
      <Form
        key={fillCount}
        id='pinch-product'
        form={fields}
        initialData={initialData}
        columns={1}
        onDataChange={(data) =>
          setFormData((current) => ({
            ...current,
            ...(data as FormData),
            price: current.price,
            sizeAmount: current.sizeAmount,
            sizeUnit: current.sizeUnit,
            link: current.link,
          }))
        }
        onSubmit={(data) => {
          void handleSubmit(data as FormData);
        }}
        submitButton={
          <ModalFooterActions
            note={isFormComplete ? null : getBlocker()}
            leftActions={
              product && (
                <DeleteIconButton
                  onClick={() => void handleDelete()}
                  disabled={isSubmitting}
                />
              )
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
                disabled={isSubmitting || !isFormComplete}
              >
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
