import { memo, useMemo, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Plus, ShoppingCart, Store } from 'lucide-react';

import FilterBar, { FilterSection } from '@/components/FilterBar';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import SectionHeader from '@/components/SectionHeader';
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
import {
  INGREDIENT_FLAG_OPTIONS,
  INGREDIENT_PRICE_FILTER_OPTIONS,
  KITCHEN_VIEW_LABELS,
  KITCHEN_VIEWS,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectDefaultProducts,
  selectIngredientFamilies,
  selectIngredientFamiliesById,
  selectIngredients,
  selectIngredientsById,
  selectProducts,
  selectProductsById,
  selectStores,
  selectUsedIngredientIds,
} from '@apps/pinch/store/selectors';
import type { KitchenView } from '@apps/pinch/types';
import {
  groupByFamily,
  searchIngredients,
} from '@apps/pinch/utils/catalogSearch';

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

interface EntryRowProps {
  icon: ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}

function EntryRow({ icon, label, count, onClick }: EntryRowProps) {
  return (
    <Button
      type='button'
      variant='secondary'
      onClick={onClick}
      className='h-14 min-w-0 justify-start gap-2.5 rounded-2xl px-3'
    >
      <span
        className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pinch-drizzle-soft)] max-[360px]:hidden'
        aria-hidden='true'
      >
        {icon}
      </span>
      <span className='min-w-0 flex-1 truncate text-left'>{label}</span>
      {count > 0 && (
        <span className='text-muted-foreground text-sm font-normal'>
          {count}
        </span>
      )}
      <ChevronRight
        className='text-muted-foreground h-4 w-4 shrink-0 max-[400px]:hidden'
        aria-hidden='true'
      />
    </Button>
  );
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

  const trimmed = query.trim();
  const scoped = useMemo(
    () =>
      view === 'all' || trimmed !== ''
        ? ingredients
        : ingredients.filter(
            (ingredient) =>
              ingredient.isCustom ||
              ingredient.isAdjusted ||
              defaultProducts.has(ingredient.id) ||
              usedIds.has(ingredient.id),
          ),
    [ingredients, view, trimmed, defaultProducts, usedIds],
  );
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
  const countText =
    hasFilters || trimmed !== ''
      ? `${shown.length} of ${scoped.length}`
      : `${shown.length}`;
  const clearFilters = () => setFilters(NO_INGREDIENT_FILTERS);

  const getEmptyState = () => {
    if (hasFilters) {
      return (
        <div className='space-y-3 py-6 text-center'>
          <p className='text-muted-foreground text-sm'>
            Nothing{view === 'yours' && trimmed === '' ? ' in Yours' : ''}{' '}
            matches
            {trimmed !== '' ? ` “${trimmed}” with` : ''} these filters.
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
            {view === 'yours' && trimmed === '' && (
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
        subtitle='Your ingredients, products and stores, in one place.'
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
        searchPlaceholder='Search ingredients'
        filterLabel='Filter ingredients'
        activeFilters={activeFilters}
        onRemoveFilter={(key) =>
          setFilters((current) => removeIngredientFilter(current, key))
        }
        onClearFilters={clearFilters}
        doneLabel={`Show ${shown.length} ${shown.length === 1 ? 'ingredient' : 'ingredients'}`}
        leading={
          <PillGroup
            label='Which ingredients'
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
            isThin
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
