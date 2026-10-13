import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Plus, Star } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import MacroStats from '@/components/MacroStats';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { CATALOG_STORES_BY_ID } from '@apps/pinch/catalog/catalogStores';
import StoreLogo from '@apps/pinch/components/shared/StoreLogo';
import { setDefaultProduct } from '@apps/pinch/store/actions/productActions';
import { UNIT_LABELS } from '@apps/pinch/constants';
import {
  selectDefaultProducts,
  selectIngredientFamiliesById,
  selectIngredientsById,
  selectProductsByIngredient,
  selectShowNutrition,
  selectStoresById,
} from '@apps/pinch/store/selectors';
import { hasAnyMetricOn } from '@apps/pinch/utils/nutritionMath';
import { formatSize } from '@apps/pinch/utils/productFormat';

interface IngredientDrawerProps {
  uid: string;
  ingredientId: string;
  onClose: () => void;
  onModify: (id: string) => void;
  onAddProduct: (ingredientId: string) => void;
  onEditProduct: (ingredientId: string, productId: string) => void;
}

function IngredientDrawer({
  uid,
  ingredientId,
  onClose,
  onModify,
  onAddProduct,
  onEditProduct,
}: IngredientDrawerProps) {
  const dispatch = useAppDispatch();
  const products =
    useAppSelector(selectProductsByIngredient).get(ingredientId) ?? [];
  const show = useAppSelector(selectShowNutrition);
  const defaultProductId =
    useAppSelector(selectDefaultProducts).get(ingredientId)?.id ?? null;
  const storesById = useAppSelector(selectStoresById);
  const [error, setError] = useState<string | null>(null);

  const ingredient = useAppSelector(selectIngredientsById).get(ingredientId);
  const family = useAppSelector(selectIngredientFamiliesById).get(
    ingredient?.familyId ?? '',
  );

  if (!ingredient) {
    return null;
  }

  const servingText = `${Math.round(ingredient.serving.amount * 100) / 100} ${UNIT_LABELS[ingredient.serving.unit]}`;

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
            Add a product
          </Button>
        </div>
      }
    >
      <div className='space-y-5'>
        <ul className='flex flex-wrap gap-2'>
          {[
            family?.name,
            ingredient.isCustom && 'One you added',
            ingredient.isAdjusted && 'Adjusted by you',
            `1 serving = ${servingText}`,
          ]
            .filter((chip): chip is string => typeof chip === 'string')
            .map((chip) => (
              <li
                key={chip}
                className='bg-accent text-accent-foreground rounded-full px-3 py-1.5 text-sm font-medium'
              >
                {chip}
              </li>
            ))}
        </ul>
        {ingredient.aliases.length > 0 && (
          <p className='text-muted-foreground text-sm'>
            Also called {ingredient.aliases.join(', ')}
          </p>
        )}

        {hasAnyMetricOn(show) && (
          <section aria-label='Nutrition per 100 g' className='space-y-2'>
            <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              Per 100 g
            </h3>
            <MacroStats
              values={ingredient.per100g}
              show={show}
              variant='tiles'
            />
          </section>
        )}

        <section aria-label='Products' className='space-y-2'>
          <div className='flex items-center justify-between gap-3'>
            <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              Products
            </h3>
          </div>
          {products.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              No product yet. Add where you buy it and recipes can show what
              they cost.
            </p>
          ) : (
            <ul className='divide-border divide-y'>
              {products.map((product) => {
                const store = storesById.get(product.storeId);
                const storeName = store?.name ?? 'Removed store';
                const isDefault = product.id === defaultProductId;
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
                          ? 'Default product'
                          : 'Make this the default product'
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
                                'Unable to change the default product.',
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
                      <span className='font-semibold whitespace-nowrap'>
                        {formatCents(product.priceCents)}
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
