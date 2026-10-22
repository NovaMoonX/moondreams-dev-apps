import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Plus, Star } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import HelpTip from '@/components/HelpTip';
import LabelChip from '@/components/LabelChip';
import MacroStats from '@/components/MacroStats';
import { PillGroup } from '@/components/PillGroup';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { CATALOG_INGREDIENTS_BY_ID } from '@apps/pinch/catalog';
import { CATALOG_STORES_BY_ID } from '@apps/pinch/catalog/catalogStores';
import IngredientStock from '@apps/pinch/components/pantry/IngredientStock';
import StoreLogo from '@apps/pinch/components/shared/StoreLogo';
import { useListViewOptions } from '@apps/pinch/hooks/useListViewOptions';
import { setDefaultProduct } from '@apps/pinch/store/actions/productActions';
import { NUTRITION_BASIS_OPTIONS, UNIT_LABELS } from '@apps/pinch/constants';
import {
  selectDefaultProducts,
  selectIngredientFamiliesById,
  selectIngredientRecordsById,
  selectIngredientsById,
  selectMeals,
  selectProductsByIngredient,
  selectRecipes,
  selectShowNutrition,
  selectStoresById,
} from '@apps/pinch/store/selectors';
import { getIngredientAdjustments } from '@apps/pinch/utils/ingredientAdjustments';
import {
  getServingGrams,
  scaleNutrition,
  type NutritionBasis,
} from '@apps/pinch/utils/nutritionBasis';
import { hasShownValue } from '@apps/pinch/utils/nutritionMath';
import { formatSize, formatUnitPrice } from '@apps/pinch/utils/productFormat';

const MAX_SHOWN_ALIASES = 3;

const BASIS_CHOICES = NUTRITION_BASIS_OPTIONS.map((option) => ({ ...option }));

interface IngredientDrawerProps {
  uid: string;
  ingredientId: string;
  onClose: () => void;
  onModify: (id: string) => void;
  onAddProduct: (ingredientId: string) => void;
  onEditProduct: (ingredientId: string, productId: string) => void;
  /** Closes the drawer and opens the pantry on this ingredient's packages. */
  onOpenPantry: (ingredientId: string) => void;
  onAddPackage: (ingredientId: string) => void;
}

function IngredientDrawer({
  uid,
  ingredientId,
  onClose,
  onModify,
  onAddProduct,
  onEditProduct,
  onOpenPantry,
  onAddPackage,
}: IngredientDrawerProps) {
  const dispatch = useAppDispatch();
  const products =
    useAppSelector(selectProductsByIngredient).get(ingredientId) ?? [];
  const show = useAppSelector(selectShowNutrition);
  const defaultProduct = useAppSelector(selectDefaultProducts).get(
    ingredientId,
  );
  const defaultProductId = defaultProduct?.id ?? null;
  const storesById = useAppSelector(selectStoresById);
  const [error, setError] = useState<string | null>(null);
  const { options, update } = useListViewOptions(uid, 'ingredients');

  const ingredient = useAppSelector(selectIngredientsById).get(ingredientId);
  const familiesById = useAppSelector(selectIngredientFamiliesById);
  const family = familiesById.get(ingredient?.familyId ?? '');
  const record = useAppSelector((state) =>
    selectIngredientRecordsById(state).get(ingredientId),
  );
  const recipes = useAppSelector(selectRecipes);
  const meals = useAppSelector(selectMeals);
  const usedIn = useMemo(() => {
    const usingRecipes = recipes.filter((recipe) =>
      recipe.ingredients.some((line) => line.ingredientId === ingredientId),
    );
    const mealCount = meals.filter((meal) =>
      meal.items.some(
        (item) => item.kind === 'INGREDIENT' && item.refId === ingredientId,
      ),
    ).length;
    const getRecipesText = () => {
      if (usingRecipes.length === 0) return null;
      return usingRecipes.length === 1
        ? usingRecipes[0].title
        : `${usingRecipes.length} recipes`;
    };
    const parts = [
      getRecipesText(),
      mealCount > 0 &&
        `${mealCount} ${mealCount === 1 ? 'saved meal' : 'saved meals'}`,
    ].filter((part) => typeof part === 'string');
    return parts.length === 0 ? null : `Used in ${parts.join(' and ')}`;
  }, [recipes, meals, ingredientId]);

  if (!ingredient) {
    return null;
  }

  const catalogIngredient = CATALOG_INGREDIENTS_BY_ID.get(ingredient.id);
  const adjustments =
    ingredient.isAdjusted && catalogIngredient && record
      ? getIngredientAdjustments(
          catalogIngredient,
          record,
          (familyId) => familiesById.get(familyId)?.name ?? null,
        )
      : [];
  const servingText = `${Math.round(ingredient.serving.amount * 100) / 100} ${UNIT_LABELS[ingredient.serving.unit]}`;
  const servingGrams = getServingGrams(ingredient.serving, ingredient);
  const hasServingChoice =
    servingGrams !== null && Math.abs(servingGrams - 100) > 0.005;
  const basis: NutritionBasis = hasServingChoice ? options.basis : 'PER_100G';
  const isPerServing = basis === 'SERVING' && servingGrams !== null;
  const nutritionCaption = isPerServing
    ? `Per 1 serving (${servingText})`
    : 'Per 100 g';
  const nutritionValues = isPerServing
    ? scaleNutrition(ingredient.per100g, servingGrams / 100)
    : ingredient.per100g;
  const shownAliases = ingredient.aliases.slice(0, MAX_SHOWN_ALIASES);
  const hiddenAliasCount = ingredient.aliases.length - shownAliases.length;

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={ingredient.name}
      footer={
        <div className='flex gap-2 px-4 pb-4'>
          <Button
            type='button'
            variant='secondary'
            className='shrink-0'
            onClick={() => onModify(ingredient.id)}
          >
            {ingredient.isCustom ? 'Modify' : 'Adjust'}
          </Button>
          <Button
            type='button'
            className='min-w-0 flex-1 gap-1'
            onClick={() => onAddProduct(ingredient.id)}
          >
            <Plus className='h-4 w-4' aria-hidden='true' />
            Add a price
          </Button>
        </div>
      }
    >
      <div className='space-y-5'>
        <div className='space-y-1.5 empty:hidden'>
          {(family || ingredient.isCustom || ingredient.isAdjusted) && (
            <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm'>
              {family && <span className='font-medium'>{family.name}</span>}
              {ingredient.isCustom && <LabelChip>Added by you</LabelChip>}
              {ingredient.isAdjusted && (
                <HelpTip badgeLabel='Adjusted' title='What you adjusted'>
                  <p>
                    This ingredient is built in, with a few values of yours.
                  </p>
                  {adjustments.length === 0 ? (
                    <p>Its values match the built-in ones now.</p>
                  ) : (
                    <ul className='border-border divide-border max-h-[40dvh] divide-y overflow-y-auto rounded-xl border'>
                      {adjustments.map((adjustment) => (
                        <li key={adjustment.key} className='px-3 py-2'>
                          <p className='font-medium'>{adjustment.label}</p>
                          <p className='text-muted-foreground flex flex-wrap gap-x-3 text-xs'>
                            <span className='whitespace-nowrap'>
                              Built in {adjustment.builtIn}
                            </span>
                            <span className='whitespace-nowrap'>
                              Yours {adjustment.yours}
                            </span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className='text-muted-foreground'>
                    To go back to the built-in values, tap Adjust and then the
                    trash button.
                  </p>
                </HelpTip>
              )}
            </div>
          )}
          {(usedIn !== null || shownAliases.length > 0) && (
            <div className='text-muted-foreground space-y-1 text-sm'>
              {usedIn !== null && (
                <p className='line-clamp-2 wrap-break-word'>{usedIn}</p>
              )}
              {shownAliases.length > 0 && (
                <p className='line-clamp-2 wrap-break-word'>
                  Also called {shownAliases.join(', ')}
                  {hiddenAliasCount > 0 && ` and ${hiddenAliasCount} more`}
                </p>
              )}
            </div>
          )}
        </div>

        {hasShownValue(nutritionValues, show) && (
          <section aria-label={nutritionCaption} className='space-y-2'>
            <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-2'>
              <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
                {nutritionCaption}
              </h3>
              {hasServingChoice && (
                <PillGroup
                  label='Nutrition per'
                  options={BASIS_CHOICES}
                  value={basis}
                  onChange={(next) => update({ basis: next })}
                  isThin
                />
              )}
            </div>
            <MacroStats values={nutritionValues} show={show} variant='tiles' />
          </section>
        )}

        <IngredientStock
          ingredientId={ingredient.id}
          isUsed={usedIn !== null}
          onOpen={() => onOpenPantry(ingredient.id)}
          onAdd={() => onAddPackage(ingredient.id)}
        />

        <section aria-label='Where you buy it' className='space-y-2'>
          <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            Where you buy it
          </h3>
          {products.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              No price yet. Add where you buy it and recipes can show what they
              cost.
            </p>
          ) : (
            <ul className='divide-border divide-y'>
              {products.map((product) => {
                const store = storesById.get(product.storeId);
                const storeName = store?.name ?? 'Removed store';
                const isDefault = product.id === defaultProductId;
                const unitPrice = formatUnitPrice(
                  product,
                  defaultProduct?.sizeUnit,
                );
                const detail = [
                  product.label,
                  formatSize(product.sizeAmount, product.sizeUnit),
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={product.id} className='flex items-center gap-1'>
                    <Button
                      type='button'
                      variant='tertiary'
                      size='icon'
                      aria-label={
                        isDefault
                          ? 'Default price'
                          : 'Make this the default price'
                      }
                      aria-pressed={isDefault}
                      disabled={isDefault}
                      className='size-10 shrink-0 p-0'
                      onClick={() => {
                        setError(null);
                        dispatch(
                          setDefaultProduct({
                            uid,
                            ingredientId,
                            productId: product.id,
                          }),
                        )
                          .unwrap()
                          .catch((starError) =>
                            setError(
                              getErrorMessage(
                                starError,
                                'Unable to change the default price.',
                              ),
                            ),
                          );
                      }}
                    >
                      <Star
                        className={join(
                          'h-4 w-4',
                          isDefault &&
                            'fill-current text-[var(--pinch-drizzle)]',
                        )}
                        aria-hidden='true'
                      />
                    </Button>
                    <Button
                      type='button'
                      variant='tertiary'
                      className='h-auto min-h-14 min-w-0 flex-1 justify-start gap-3 px-0! py-2 text-left'
                      onClick={() => onEditProduct(ingredient.id, product.id)}
                    >
                      <StoreLogo
                        name={storeName}
                        domain={
                          store?.catalogStoreId
                            ? (CATALOG_STORES_BY_ID.get(store.catalogStoreId)
                                ?.domain ?? null)
                            : null
                        }
                        imagePath={store?.imagePath ?? null}
                        imageVersion={store?.updatedAt ?? 0}
                        size={32}
                      />
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate font-medium'>
                          {storeName}
                        </span>
                        <span className='text-muted-foreground block truncate text-xs font-normal'>
                          {detail}
                        </span>
                      </span>
                      <span className='shrink-0 text-right'>
                        <span className='block font-semibold whitespace-nowrap'>
                          {formatCents(product.priceCents)}
                        </span>
                        {unitPrice && (
                          <span className='text-muted-foreground block text-xs font-normal whitespace-nowrap'>
                            {unitPrice}
                          </span>
                        )}
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className='text-destructive text-sm'>{error}</p>}
        </section>
      </div>
    </DetailSheet>
  );
}

export default IngredientDrawer;
