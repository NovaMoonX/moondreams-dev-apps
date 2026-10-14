import { memo, useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Plus, ShoppingCart, Store } from 'lucide-react';

import FilterBar, { FilterSection } from '@/components/FilterBar';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import SectionHeader from '@/components/SectionHeader';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppSelector } from '@/store';
import FamilyGroup from '@apps/pinch/components/kitchen/FamilyGroup';
import IngredientDrawer from '@apps/pinch/components/kitchen/IngredientDrawer';
import IngredientFormSheet from '@apps/pinch/components/kitchen/IngredientFormSheet';
import {
  applyIngredientFilters,
  getActiveIngredientFilters,
  NO_INGREDIENT_FILTERS,
  removeIngredientFilter,
  type IngredientFilters,
} from '@apps/pinch/components/kitchen/ingredientFilters';
import ProductFormSheet from '@apps/pinch/components/kitchen/ProductFormSheet';
import EntryRow from '@apps/pinch/components/shared/EntryRow';
import ListViewControls from '@apps/pinch/components/shared/ListViewControls';
import {
  INGREDIENT_FLAG_OPTIONS,
  INGREDIENT_PRICE_FILTER_OPTIONS,
  KITCHEN_VIEW_LABELS,
  KITCHEN_VIEWS,
} from '@apps/pinch/constants';
import { useListViewOptions } from '@apps/pinch/hooks/useListViewOptions';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectDefaultProducts,
  selectIngredientFamilies,
  selectIngredientFamiliesById,
  selectIngredients,
  selectIngredientsById,
  selectProducts,
  selectProductsById,
  selectShowNutrition,
  selectStores,
  selectUsedIngredientIds,
} from '@apps/pinch/store/selectors';
import type { KitchenView } from '@apps/pinch/types';
import {
  groupByFamily,
  searchIngredients,
} from '@apps/pinch/utils/catalogSearch';
import { hasAnyMetricOn } from '@apps/pinch/utils/nutritionMath';

const EAGER_GROUPS = 3;
const VIEW_OPTIONS = KITCHEN_VIEWS.map((value) => ({
  value,
  label: KITCHEN_VIEW_LABELS[value],
}));
const PRICE_OPTIONS = INGREDIENT_PRICE_FILTER_OPTIONS.map((option) => ({
  ...option,
}));
const FLAG_OPTIONS = INGREDIENT_FLAG_OPTIONS.map((option) => ({ ...option }));

type Overlay =
  | { kind: 'details'; id: string }
  | { kind: 'form'; id: string | null }
  | { kind: 'product'; ingredientId: string; productId: string | null };

interface KitchenScreenProps {
  uid: string;
}

function KitchenScreen({ uid }: KitchenScreenProps) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<KitchenView>('yours');
  const [filters, setFilters] = useState<IngredientFilters>(
    NO_INGREDIENT_FILTERS,
  );
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const ingredients = useAppSelector(selectIngredients);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const families = useAppSelector(selectIngredientFamilies);
  const familiesById = useAppSelector(selectIngredientFamiliesById);
  const storeCount = useAppSelector(selectStores).length;
  const productCount = useAppSelector(selectProducts).length;
  const productsById = useAppSelector(selectProductsById);
  const defaultProducts = useAppSelector(selectDefaultProducts);
  const usedIds = useAppSelector(selectUsedIngredientIds);
  const { openSubview } = usePinchOverlay();
  const isPhone = useMediaQuery().isBelow('sm');
  const viewOptions = useListViewOptions(uid, 'ingredients');
  const isAnyMetricOn = hasAnyMetricOn(useAppSelector(selectShowNutrition));

  const trimmed = query.trim();
  const yours = useMemo(
    () =>
      ingredients.filter(
        (ingredient) =>
          ingredient.isCustom ||
          ingredient.isAdjusted ||
          defaultProducts.has(ingredient.id) ||
          usedIds.has(ingredient.id),
      ),
    [ingredients, defaultProducts, usedIds],
  );
  const scoped = view === 'all' || trimmed !== '' ? ingredients : yours;
  const filtered = useMemo(
    () => applyIngredientFilters(scoped, filters, { defaultProducts, usedIds }),
    [scoped, filters, defaultProducts, usedIds],
  );
  const shown = useMemo(
    () => searchIngredients(filtered, trimmed),
    [filtered, trimmed],
  );
  const groups = useMemo(
    () => groupByFamily(shown, families),
    [shown, families],
  );
  const familyOptions = useMemo(() => {
    const counts = scoped.reduce(
      (acc, ingredient) =>
        acc.set(
          ingredient.familyId ?? '',
          (acc.get(ingredient.familyId ?? '') ?? 0) + 1,
        ),
      new Map<string, number>(),
    );
    return families
      .filter(
        (family) =>
          counts.has(family.id) || filters.familyIds.includes(family.id),
      )
      .map((family) => ({
        value: family.id,
        label: `${family.name} · ${counts.get(family.id) ?? 0}`,
      }));
  }, [scoped, families, filters.familyIds]);
  const activeFilters = useMemo(
    () => getActiveIngredientFilters(filters, familiesById),
    [filters, familiesById],
  );

  const hasFilters = activeFilters.length > 0;
  const isPriceFiltered = filters.price !== 'any';
  const totalCount = isPriceFiltered ? yours.length : scoped.length;
  const countText =
    hasFilters || trimmed !== ''
      ? `${shown.length} of ${totalCount}`
      : `${shown.length}`;
  const clearFilters = () => setFilters(NO_INGREDIENT_FILTERS);

  const getEmptyState = () => {
    if (hasFilters) {
      const isNothingNeeded =
        filters.price === 'needs' &&
        filters.flags.length === 0 &&
        filters.familyIds.length === 0 &&
        trimmed === '';
      const canWiden =
        view === 'yours' &&
        trimmed === '' &&
        applyIngredientFilters(ingredients, filters, {
          defaultProducts,
          usedIds,
        }).length > 0;
      const scopeText =
        isPriceFiltered || (view === 'yours' && trimmed === '')
          ? ' in Yours'
          : '';
      return (
        <div className='space-y-3 py-6 text-center'>
          <p className='text-muted-foreground text-sm wrap-break-word'>
            {isNothingNeeded
              ? 'Nothing is waiting on a price.'
              : `Nothing${scopeText} matches${trimmed !== '' ? ` “${trimmed}” with` : ''} these filters.`}
          </p>
          <div className='flex flex-wrap justify-center gap-2'>
            <Button
              type='button'
              variant='secondary'
              className='h-10'
              onClick={clearFilters}
            >
              Clear filters
            </Button>
            {canWiden && (
              <Button
                type='button'
                variant='secondary'
                className='h-10'
                onClick={() => setView('all')}
              >
                Look through everything
              </Button>
            )}
          </div>
        </div>
      );
    }
    if (trimmed !== '') {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
          Nothing matches “{trimmed}” yet. Try another name.
        </p>
      );
    }
    return (
      <div className='space-y-2 py-6 text-center'>
        <p className='text-muted-foreground text-sm'>
          Ingredients you add or adjust will show up here.
        </p>
        <Button
          type='button'
          variant='secondary'
          className='h-10'
          onClick={() => setView('all')}
        >
          Browse every ingredient
        </Button>
      </div>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader
        title='Kitchen'
        subtitle='Your ingredients, products and stores.'
      />
      <div className='grid grid-cols-2 gap-2'>
        <EntryRow
          icon={<Store className='h-4 w-4' />}
          label='Stores'
          count={storeCount}
          onClick={() => openSubview({ kind: 'stores' })}
        />
        <EntryRow
          icon={<ShoppingCart className='h-4 w-4' />}
          label='Products'
          count={productCount}
          onClick={() => openSubview({ kind: 'products' })}
        />
      </div>
      <div className='flex h-10 items-center justify-between gap-3'>
        <h3 className='text-muted-foreground flex min-w-0 items-baseline gap-2 text-xs font-semibold tracking-wide uppercase'>
          Ingredients
          <span className='text-xs font-normal tracking-normal whitespace-nowrap normal-case'>
            {countText}
          </span>
        </h3>
        <Button
          type='button'
          size='sm'
          rounded='full'
          className='gap-1'
          onClick={() => setOverlay({ kind: 'form', id: null })}
        >
          <Plus className='h-4 w-4' aria-hidden='true' />
          New
        </Button>
      </div>
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder={isPhone ? 'Search' : 'Search ingredients'}
        filterLabel='Filter ingredients'
        activeFilters={activeFilters}
        onRemoveFilter={(key) =>
          setFilters((current) => removeIngredientFilter(current, key))
        }
        onClearFilters={clearFilters}
        doneLabel={`Show ${shown.length} ${shown.length === 1 ? 'ingredient' : 'ingredients'}`}
        compactDoneLabel={`Show ${shown.length}`}
        leading={
          <PillGroup
            label='Which ingredients'
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
            isThin
          />
        }
        trailing={
          <ListViewControls
            options={viewOptions.options}
            customizedCount={viewOptions.customizedCount}
            onChange={viewOptions.update}
            onReset={viewOptions.reset}
            hasBasis
          />
        }
      >
        <FilterSection title='Price'>
          <PillGroup
            label='Price'
            options={PRICE_OPTIONS}
            value={filters.price}
            onChange={(price) =>
              setFilters((current) => ({ ...current, price }))
            }
          />
          <p className='text-muted-foreground text-xs'>
            <strong className='text-foreground font-medium'>
              Needs a price
            </strong>{' '}
            looks at what your recipes, meals and plans use.{' '}
            <strong className='text-foreground font-medium'>Has a price</strong>{' '}
            looks at what you've priced. Both only search Yours, even with All
            picked.
          </p>
        </FilterSection>
        <FilterSection title='Show only'>
          <MultiPillGroup
            label='Show only'
            options={FLAG_OPTIONS}
            values={filters.flags}
            onChange={(flags) =>
              setFilters((current) => ({ ...current, flags }))
            }
          />
        </FilterSection>
        {familyOptions.length > 0 && (
          <FilterSection title='Family'>
            <MultiPillGroup
              label='Families'
              options={familyOptions}
              values={filters.familyIds}
              onChange={(familyIds) =>
                setFilters((current) => ({ ...current, familyIds }))
              }
            />
          </FilterSection>
        )}
      </FilterBar>
      {groups.length === 0 ? (
        getEmptyState()
      ) : (
        <div className='space-y-4 lg:block lg:columns-2 lg:space-y-0 lg:gap-x-8'>
          {groups.map((group, index) => (
            <FamilyGroup
              key={group.family.id || 'none'}
              group={group}
              isEager={index < EAGER_GROUPS}
              showPrices={viewOptions.options.showPrices}
              showMacros={viewOptions.options.showMacros && isAnyMetricOn}
              basis={viewOptions.options.basis}
              onOpen={(id) => setOverlay({ kind: 'details', id })}
            />
          ))}
        </div>
      )}
      {overlay?.kind === 'details' && (
        <IngredientDrawer
          key={overlay.id}
          uid={uid}
          ingredientId={overlay.id}
          onClose={() => setOverlay(null)}
          onModify={(id) => setOverlay({ kind: 'form', id })}
          onAddProduct={(ingredientId) =>
            setOverlay({ kind: 'product', ingredientId, productId: null })
          }
          onEditProduct={(ingredientId, productId) =>
            setOverlay({ kind: 'product', ingredientId, productId })
          }
        />
      )}
      {overlay?.kind === 'form' && (
        <IngredientFormSheet
          key={overlay.id ?? 'new'}
          uid={uid}
          ingredient={
            overlay.id ? (ingredientsById.get(overlay.id) ?? null) : null
          }
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'product' &&
        ingredientsById.has(overlay.ingredientId) &&
        (overlay.productId === null || productsById.has(overlay.productId)) && (
          <ProductFormSheet
            key={overlay.productId ?? `new-${overlay.ingredientId}`}
            uid={uid}
            ingredient={ingredientsById.get(overlay.ingredientId)!}
            product={
              overlay.productId
                ? (productsById.get(overlay.productId) ?? null)
                : null
            }
            onClose={() => setOverlay(null)}
          />
        )}
    </div>
  );
}

export default memo(KitchenScreen);
