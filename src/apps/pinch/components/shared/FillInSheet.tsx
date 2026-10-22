import { useState } from 'react';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import MoneyInput from '@/components/MoneyInput';
import RevealChip from '@/components/RevealChip';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { centsToInputValue, parseMoneyToCents } from '@/utils/moneyUtils';
import { isValidHttpsUrl } from '@/utils/urlUtils';
import ProductLinkField from '@apps/pinch/components/kitchen/ProductLinkField';
import StorePicker from '@apps/pinch/components/kitchen/StorePicker';
import { useProductPageReading } from '@apps/pinch/components/kitchen/useProductPageReading';
import UnitSelect from '@apps/pinch/components/shared/UnitSelect';
import {
  MAX_LINK_URL_LENGTH,
  MAX_PRICE_CENTS,
  MAX_SERVING_AMOUNT,
  NUTRITION_CELLS,
} from '@apps/pinch/constants';
import { saveIngredient } from '@apps/pinch/store/actions/ingredientActions';
import { saveProduct } from '@apps/pinch/store/actions/productActions';
import {
  selectDefaultProducts,
  selectIngredientsById,
  selectPlannedMeals,
  selectRecipes,
  selectRecipesById,
  selectShowNutrition,
  selectStoresById,
} from '@apps/pinch/store/selectors';
import type { Gap, Product, Unit } from '@apps/pinch/types';
import { getGapKey } from '@apps/pinch/utils/gaps';
import {
  getIngredientUses,
  getPackageUnit,
  getUseText,
  rankGaps,
} from '@apps/pinch/utils/gapOrder';
import { formatSize } from '@apps/pinch/utils/productFormat';

interface RowState {
  storeId: string | null;
  price: string;
  sizeAmount: string;
  sizeUnit: Unit;
  link: string;
  isLinkShown: boolean;
  suggestedStore: string | null;
  /** Bumped by a reading so the store picker is seeded again. */
  fillCount: number;
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
  const recipes = useAppSelector(selectRecipes);
  const recipesById = useAppSelector(selectRecipesById);
  const plannedMeals = useAppSelector(selectPlannedMeals);
  const uses = getIngredientUses(
    recipes,
    plannedMeals,
    recipesById,
    ingredientsById,
  );
  const [rows] = useState(() => rankGaps(gaps, uses));
  const [lastStoreId, setLastStoreId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, RowState>>({});
  const [nutrition, setNutrition] = useState<
    Record<string, Record<string, string>>
  >({});
  const [index, setIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    reading,
    read,
    reset: resetReading,
  } = useProductPageReading({ hasLabel: false });

  const getRow = (gap: Gap): RowState =>
    values[getGapKey(gap)] ?? {
      storeId:
        lastStoreId !== null && storesById.has(lastStoreId)
          ? lastStoreId
          : null,
      price: '',
      sizeAmount: '',
      sizeUnit: getPackageUnit(
        uses.get(gap.ingredientId),
        ingredientsById.get(gap.ingredientId),
      ),
      link: '',
      isLinkShown: false,
      suggestedStore: null,
      fillCount: 0,
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
      url:
        isValidHttpsUrl(row.link.trim()) &&
        row.link.trim().length <= MAX_LINK_URL_LENGTH
          ? row.link.trim()
          : null,
      makeDefault: true,
    };
  };

  const show = useAppSelector(selectShowNutrition);
  const gap = rows[index];
  const ingredient = ingredientsById.get(gap.ingredientId);
  const row = getRow(gap);
  const product: Product | undefined = defaultProducts.get(gap.ingredientId);
  const name = ingredient?.name ?? 'Removed ingredient';
  const useText = getUseText(uses.get(gap.ingredientId), ingredient);
  const isNutrition = gap.kind === 'NO_NUTRITION';
  const metricsAsked = NUTRITION_CELLS.filter(
    (cell) => show[cell.key] && ingredient?.per100g[cell.key] === null,
  );
  const typed = nutrition[getGapKey(gap)] ?? {};
  const typedValues = metricsAsked.map((cell) => ({
    key: cell.key,
    text: (typed[cell.key] ?? '').trim(),
  }));
  const isNutritionValid =
    typedValues.some((entry) => entry.text !== '') &&
    typedValues.every(
      (entry) =>
        entry.text === '' ||
        (Number.isFinite(Number(entry.text)) &&
          Number(entry.text) >= 0 &&
          Number(entry.text) <= 100000),
    );
  const draft = isNutrition ? null : getDraft(gap, row);
  const canSave = isNutrition ? isNutritionValid : draft !== null;
  const isLast = index + 1 >= rows.length;

  const fillFromPage = async (pageLink: string) => {
    const result = await read(pageLink);
    if (result === null) {
      return;
    }

    const { found, match } = result;
    const id = getGapKey(gap);
    setValues((current) => {
      const live = { ...getRow(gap), ...current[id] };
      return {
        ...current,
        [id]: {
          ...live,
          storeId: match.storeId ?? live.storeId,
          price:
            found.priceCents === null
              ? live.price
              : centsToInputValue(found.priceCents),
          sizeAmount:
            found.sizeAmount === null || found.sizeUnit === null
              ? live.sizeAmount
              : String(found.sizeAmount),
          sizeUnit: found.sizeUnit ?? live.sizeUnit,
          link: pageLink,
          suggestedStore: match.storeId === null ? match.suggestedName : null,
          fillCount: live.fillCount + 1,
        },
      };
    });
    if (match.storeId !== null) {
      setLastStoreId(match.storeId);
    }
  };

  const advance = () => {
    resetReading();
    setError(null);
    if (isLast) {
      onClose();
      return;
    }
    setIndex(index + 1);
  };

  const handleSave = async () => {
    if (!canSave || !ingredient) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      if (isNutrition) {
        await dispatch(
          saveIngredient({
            uid,
            draft: {
              id: ingredient.id,
              catalogId: ingredient.isCustom ? null : ingredient.id,
              name: ingredient.name,
              familyId: ingredient.familyId,
              newFamilyName: null,
              nutrition: {
                ...ingredient.per100g,
                ...Object.fromEntries(
                  typedValues
                    .filter((entry) => entry.text !== '')
                    .map((entry) => [entry.key, Number(entry.text)]),
                ),
              },
              servingAmount: ingredient.serving.amount,
              servingUnit: ingredient.serving.unit,
              aliases: null,
            },
          }),
        ).unwrap();
      } else if (draft) {
        await dispatch(saveProduct({ uid, draft })).unwrap();
      }
      setIsSubmitting(false);
      advance();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save these details.'));
      setIsSubmitting(false);
    }
  };

  return (
    <FormSheet
      isOpen
      onClose={onClose}
      title={isNutrition ? 'Nutrition values' : 'Prices and sizes'}
    >
      <div className='grid gap-4'>
        <div>
          <div className='flex items-center gap-3'>
            <p className='min-w-0 flex-1 truncate text-lg font-medium'>
              {name}
            </p>
            {rows.length > 1 && (
              <span className='text-muted-foreground text-sm whitespace-nowrap'>
                {index + 1} of {rows.length}
              </span>
            )}
          </div>
          {useText && (
            <p className='text-muted-foreground text-sm wrap-break-word'>
              {useText}
            </p>
          )}
        </div>
        {isNutrition && (
          <div className='space-y-3'>
            <p className='text-muted-foreground text-sm'>
              {metricsAsked.length === 0
                ? `${name} has its values, but Pinch can't turn the amount in your recipe into grams. A unit with a weight, like g, oz or lb, will fix it.`
                : `What's in 100 g of ${name}? Fill in what you know.`}
            </p>
            <div className='grid grid-cols-2 gap-3'>
              {metricsAsked.map((cell) => (
                <div key={cell.key} className='space-y-1.5'>
                  <Label>
                    {cell.unit === '' ? cell.label : `${cell.label} (g)`}
                  </Label>
                  <Input
                    type='number'
                    inputMode='decimal'
                    min={0}
                    step='any'
                    variant='outline'
                    aria-label={`${cell.label} in 100 g of ${name}`}
                    value={typed[cell.key] ?? ''}
                    onChange={(event) =>
                      setNutrition((current) => ({
                        ...current,
                        [getGapKey(gap)]: {
                          ...current[getGapKey(gap)],
                          [cell.key]: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {gap.kind === 'NO_PRODUCT' &&
          (row.isLinkShown ? (
            <ProductLinkField
              caption='Product page'
              value={row.link}
              onChange={(link) => {
                resetReading();
                update(getGapKey(gap), gap, { link, suggestedStore: null });
              }}
              onFill={(pageLink) => void fillFromPage(pageLink)}
              isFilling={reading.isFilling}
              note={reading.note}
              error={reading.error}
            />
          ) : (
            <div>
              <RevealChip
                icon={<Plus className='h-4 w-4' aria-hidden='true' />}
                onClick={() =>
                  update(getGapKey(gap), gap, { isLinkShown: true })
                }
              >
                From a product page
              </RevealChip>
            </div>
          ))}
        {gap.kind === 'NO_PRODUCT' && (
          <StorePicker
            key={`${gap.ingredientId}-${row.fillCount}`}
            uid={uid}
            value={row.storeId}
            suggestedStoreName={row.suggestedStore}
            onChange={(storeId) => {
              update(getGapKey(gap), gap, { storeId });
              if (storeId !== null) setLastStoreId(storeId);
            }}
          />
        )}
        {gap.kind === 'NOT_COMPARABLE' && product && (
          <p className='text-muted-foreground text-sm'>
            It's set up as a {formatSize(product.sizeAmount, product.sizeUnit)}{' '}
            package, which can't be compared with the amounts in your recipes.
            How big is it, in something you'd measure by weight or volume?
          </p>
        )}
        {!isNutrition && (
          <div
            className={
              gap.kind === 'NO_PRODUCT'
                ? 'grid items-start gap-3 min-[400px]:grid-cols-[1fr_1.4fr]'
                : ''
            }
          >
            {gap.kind === 'NO_PRODUCT' && (
              <div className='space-y-1.5'>
                <Label>Price</Label>
                <MoneyInput
                  variant='outline'
                  className='h-10'
                  ariaLabel={`Price of ${name}`}
                  placeholder='9.48'
                  value={row.price}
                  onChange={(price) => update(getGapKey(gap), gap, { price })}
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
                  className='h-10 min-w-0'
                  value={row.sizeAmount}
                  onChange={(event) =>
                    update(getGapKey(gap), gap, {
                      sizeAmount: event.target.value,
                    })
                  }
                />
                <UnitSelect
                  value={row.sizeUnit}
                  className='w-24 shrink-0'
                  triggerClassName='h-10! py-0!'
                  onChange={(sizeUnit) =>
                    update(getGapKey(gap), gap, { sizeUnit })
                  }
                />
              </div>
            </div>
          </div>
        )}
        {!isNutrition && !isBlank(row) && draft === null && (
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
              disabled={isSubmitting || !canSave}
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
