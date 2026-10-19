import { memo, useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Plus, Settings, Store, Tag } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import FilterBar, { FilterSection } from '@/components/FilterBar';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
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
import PreparedEntry from '@apps/pinch/components/containers/PreparedEntry';
import PackageFormSheet from '@apps/pinch/components/pantry/PackageFormSheet';
import PantryEntry from '@apps/pinch/components/pantry/PantryEntry';
import FillInSheet from '@apps/pinch/components/shared/FillInSheet';
import ListViewControls from '@apps/pinch/components/shared/ListViewControls';
import {
  INGREDIENT_FLAG_OPTIONS,
  INGREDIENT_PRICE_FILTER_OPTIONS,
  KITCHEN_VIEW_LABELS,
  KITCHEN_VIEWS,
} from '@apps/pinch/constants';
import { useListViewOptions } from '@apps/pinch/hooks/useListViewOptions';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { usePinchSessionState } from '@apps/pinch/hooks/usePinchSession';
import {
  selectDefaultProducts,
  selectIngredientFamilies,
  selectIngredientFamiliesById,
  selectIngredients,
  selectIngredientsById,
  selectProducts,
  selectProductsById,
  selectRecipes,
  selectContainersLoadError,
  selectPackagesLoadError,
  selectShowNutrition,
  selectStores,
  selectUsedIngredientIds,
} from '@apps/pinch/store/selectors';
import type { Gap, KitchenView } from '@apps/pinch/types';
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
  | { kind: 'product'; ingredientId: string; productId: string | null }
  | { kind: 'package'; ingredientId: string }
  | { kind: 'fillIn'; gaps: Gap[] };

interface KitchenScreenProps {
  uid: string;
}

function KitchenScreen({ uid }: KitchenScreenProps) {
  const [query, setQuery] = usePinchSessionState('kitchen:query', '');
  const [view, setView] = usePinchSessionState<KitchenView>(
    'kitchen:view',
    'yours',
  );
  const [filters, setFilters] = usePinchSessionState<IngredientFilters>(
    'kitchen:filters',
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

  const hasPrepared = useAppSelector(
    (state) =>
      state.pinch.containers.items.length > 0 ||
      selectContainersLoadError(state) !== null,
  );
  const hasPantry = useAppSelector(
    (state) =>
      state.pinch.packages.items.length > 0 ||
      selectPackagesLoadError(state) !== null,
  );
  const hasRecipes = useAppSelector(selectRecipes).length > 0;
  const hasStoresOrPrices = storeCount > 0 || productCount > 0;
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
  const isFirstRun = view === 'yours' && yours.length === 0 && !hasFilters;
  const isPriceFiltered = filters.price !== 'any';
  const totalCount = isPriceFiltered ? yours.length : scoped.length;
  const noun = (count: number) => (count === 1 ? 'ingredient' : 'ingredients');
  const getCountText = () => {
    if (trimmed !== '' && view === 'yours' && !isPriceFiltered)
      return `${shown.length} found in all ingredients`;
    if (hasFilters || trimmed !== '')
      return `${shown.length} of ${totalCount} ${noun(totalCount)}`;
    return `${shown.length} ${noun(shown.length)}`;
  };
  const countText = getCountText();
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
      <EmptyCard
        icon='🥕'
        action={
          <Button
            type='button'
            variant='secondary'
            className='h-10'
            onClick={() => setView('all')}
          >
            Browse every ingredient
          </Button>
        }
      >
        Ingredients you add or adjust will show up here.
      </EmptyCard>
    );
  };

  return (
    <div className='space-y-4'>
      <div>
        <SectionHeader
          title='Kitchen'
          action={
            <div className='flex items-center gap-1'>
              {hasStoresOrPrices && (
                <Button
                  type='button'
                  variant='tertiary'
                  size='icon'
                  rounded='full'
                  aria-label='Stores & prices'
                  title='Stores & prices'
                  className='size-10 shrink-0 p-0'
                  onClick={() => openSubview({ kind: 'products' })}
                >
                  <Store className='h-5 w-5' aria-hidden='true' />
                </Button>
              )}
              {(hasRecipes || hasPrepared || hasPantry) && (
                <Button
                  type='button'
                  variant='tertiary'
                  size='icon'
                  rounded='full'
                  aria-label='Settings'
                  title='Settings'
                  className='size-10 shrink-0 p-0'
                  onClick={() => openSubview({ kind: 'settings' })}
                >
                  <Settings className='h-5 w-5' aria-hidden='true' />
                </Button>
              )}
              <Button
                type='button'
                size='sm'
                rounded='full'
                className="relative gap-1 whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] max-[359px]:size-7 max-[359px]:gap-0 max-[359px]:p-0 max-[359px]:after:-inset-x-1.5"
                onClick={() => setOverlay({ kind: 'form', id: null })}
              >
                <Plus className='h-4 w-4' aria-hidden='true' />
                <span className='max-[359px]:sr-only'>New ingredient</span>
              </Button>
            </div>
          }
        />
        <p className='text-muted-foreground -mt-1 text-sm [@media(max-height:699px)]:hidden'>
          Ingredients, pantry, fridge and freezer, and prices.
        </p>
      </div>
      {isFirstRun ? (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={isPhone ? 'Search' : 'Search ingredients'}
        />
      ) : (
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
            <>
              <PillGroup
                label='Which ingredients'
                options={VIEW_OPTIONS}
                value={view}
                onChange={setView}
                isThin
              />
              <span className='text-muted-foreground text-xs whitespace-nowrap'>
                {countText}
              </span>
            </>
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
              Price filters look at Yours.
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
      )}
      {(hasPrepared || hasPantry) && !hasFilters && trimmed === '' && (
        <nav
          aria-label='Also in Kitchen'
          className='grid grid-cols-2 gap-2 lg:gap-x-8 [&>:last-child:nth-child(odd)]:col-span-2 lg:[&>:last-child:nth-child(odd)]:col-span-1'
        >
          {hasPrepared && <PreparedEntry />}
          {hasPantry && <PantryEntry />}
        </nav>
      )}
      {filters.price === 'needs' && shown.length > 0 && (
        <Button
          type='button'
          variant='secondary'
          className='h-10 gap-1.5'
          onClick={() =>
            setOverlay({
              kind: 'fillIn',
              gaps: shown.map((ingredient) => ({
                kind: 'NO_PRODUCT',
                ingredientId: ingredient.id,
              })),
            })
          }
        >
          <Tag className='h-4 w-4' aria-hidden='true' />
          Add prices
        </Button>
      )}
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
          onOpenPantry={(ingredientId) => {
            setOverlay(null);
            openSubview({ kind: 'pantry', ingredientId });
          }}
          onAddPackage={(ingredientId) =>
            setOverlay({ kind: 'package', ingredientId })
          }
        />
      )}
      {overlay?.kind === 'package' && (
        <PackageFormSheet
          key={overlay.ingredientId}
          uid={uid}
          pkg={null}
          ingredientId={overlay.ingredientId}
          onClose={() =>
            setOverlay({ kind: 'details', id: overlay.ingredientId })
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
          onClose={() =>
            setOverlay(overlay.id ? { kind: 'details', id: overlay.id } : null)
          }
          onSaved={(id) => setOverlay({ kind: 'details', id })}
          onRemoved={() => setOverlay(null)}
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
            onClose={() =>
              setOverlay({ kind: 'details', id: overlay.ingredientId })
            }
          />
        )}
      {overlay?.kind === 'fillIn' && (
        <FillInSheet
          uid={uid}
          gaps={overlay.gaps}
          onClose={() => setOverlay(null)}
        />
      )}
    </div>
  );
}

export default memo(KitchenScreen);
