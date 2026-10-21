import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Plus, Star } from 'lucide-react';

import FilterBar, { FilterSection } from '@/components/FilterBar';
import FormSheet from '@/components/FormSheet';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import SortControl, { type SortOrder } from '@/components/SortControl';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import ProductFormSheet from '@apps/pinch/components/kitchen/ProductFormSheet';
import ItemSearch from '@apps/pinch/components/plan/ItemSearch';
import {
  LIST_PAGE_SIZE,
  LIST_SEARCH_THRESHOLD,
  PRODUCT_DEFAULT_FILTER_OPTIONS,
  PRODUCT_SORT_OPTIONS,
  PRODUCT_SORT_ORDER_LABELS,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectAllStores,
  selectDefaultProducts,
  selectIngredientFamilies,
  selectIngredientsById,
  selectProducts,
  selectProductsById,
  selectProductsByIngredient,
  selectStoresById,
} from '@apps/pinch/store/selectors';
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import { formatSize } from '@apps/pinch/utils/productFormat';
import type { Product } from '@apps/pinch/types';

const REMOVED_STORE = 'Removed store';
const DEFAULT_SORT = 'store';
const SORT_CHOICES = PRODUCT_SORT_OPTIONS.map((option) => ({ ...option }));
const DEFAULT_CHOICES = PRODUCT_DEFAULT_FILTER_OPTIONS.map((option) => ({
  ...option,
}));

type ProductSort = (typeof PRODUCT_SORT_OPTIONS)[number]['value'];
type DefaultFilter = (typeof PRODUCT_DEFAULT_FILTER_OPTIONS)[number]['value'];

interface ProductFilters {
  storeIds: string[];
  familyIds: string[];
  defaults: DefaultFilter;
}

const NO_FILTERS: ProductFilters = {
  storeIds: [],
  familyIds: [],
  defaults: 'any',
};

interface ProductRowData {
  product: Product;
  name: string;
  storeName: string;
  familyId: string;
  isDefault: boolean;
  hasSiblings: boolean;
}

const byName = (a: ProductRowData, b: ProductRowData) =>
  a.name.localeCompare(b.name) || a.storeName.localeCompare(b.storeName);

const COMPARATORS: Record<
  ProductSort,
  (a: ProductRowData, b: ProductRowData) => number
> = {
  store: (a, b) =>
    Number(a.storeName === REMOVED_STORE) -
      Number(b.storeName === REMOVED_STORE) ||
    a.storeName.localeCompare(b.storeName) ||
    byName(a, b),
  ingredient: byName,
  price: (a, b) => a.product.priceCents - b.product.priceCents || byName(a, b),
  newest: (a, b) => b.product.createdAt - a.product.createdAt,
};

const getOrderOptions = (sort: ProductSort) => {
  const [first, second] = PRODUCT_SORT_ORDER_LABELS[sort];
  return [
    { value: 'natural', label: first },
    { value: 'reversed', label: second },
  ] as const;
};

interface ProductRowProps {
  row: ProductRowData;
  showStore: boolean;
  onOpen: (id: string) => void;
}

function ProductRow({ row, showStore, onOpen }: ProductRowProps) {
  const { product } = row;
  const detail = [
    showStore && row.storeName,
    product.label,
    formatSize(product.sizeAmount, product.sizeUnit),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={() => onOpen(product.id)}
      className='h-auto w-full items-start justify-start gap-3 px-0! py-2.5 text-left'
    >
      <span className='min-w-0 flex-1'>
        <span className='flex items-center gap-1.5'>
          <span className='truncate font-medium'>{row.name}</span>
          {row.isDefault && row.hasSiblings && (
            <Star
              className='h-3.5 w-3.5 shrink-0 fill-current text-[var(--pinch-drizzle)]'
              aria-label='Default product'
            />
          )}
        </span>
        <span className='text-muted-foreground block truncate text-xs font-normal'>
          {detail}
        </span>
      </span>
      <span className='font-semibold whitespace-nowrap'>
        {formatCents(product.priceCents)}
      </span>
      <ChevronRight
        className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

interface ProductsSubviewProps {
  uid: string;
}

function ProductsSubview({ uid }: ProductsSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const products = useAppSelector(selectProducts);
  const productsById = useAppSelector(selectProductsById);
  const productsByIngredient = useAppSelector(selectProductsByIngredient);
  const defaultProducts = useAppSelector(selectDefaultProducts);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const storesById = useAppSelector(selectStoresById);
  const allStores = useAppSelector(selectAllStores);
  const families = useAppSelector(selectIngredientFamilies);
  const [typedQuery, setQuery] = useState('');
  const [pickedFilters, setFilters] = useState<ProductFilters>(NO_FILTERS);
  const [pickedSort, setSort] = useState<ProductSort>(DEFAULT_SORT);
  const [pickedOrder, setOrder] = useState<SortOrder>('natural');
  const [paging, setPaging] = useState({ key: '', limit: LIST_PAGE_SIZE });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [newIngredientId, setNewIngredientId] = useState<string | null>(null);

  const hasControls = products.length >= LIST_SEARCH_THRESHOLD;
  const query = hasControls ? typedQuery : '';
  const filters = hasControls ? pickedFilters : NO_FILTERS;
  const sort = hasControls ? pickedSort : DEFAULT_SORT;
  const order = hasControls ? pickedOrder : 'natural';

  const rows = useMemo(
    () =>
      products.map((product): ProductRowData => ({
        product,
        name:
          ingredientsById.get(product.ingredientId)?.name ??
          'Removed ingredient',
        storeName: storesById.get(product.storeId)?.name ?? REMOVED_STORE,
        familyId: ingredientsById.get(product.ingredientId)?.familyId ?? '',
        isDefault: defaultProducts.get(product.ingredientId)?.id === product.id,
        hasSiblings:
          (productsByIngredient.get(product.ingredientId)?.length ?? 0) > 1,
      })),
    [
      products,
      ingredientsById,
      storesById,
      defaultProducts,
      productsByIngredient,
    ],
  );
  const matching = useMemo(() => {
    const stores = new Set(filters.storeIds);
    const familyIds = new Set(filters.familyIds);
    const filtered = rows.filter(
      (row) =>
        (stores.size === 0 || stores.has(row.product.storeId)) &&
        (familyIds.size === 0 || familyIds.has(row.familyId)) &&
        (filters.defaults === 'any' ||
          row.isDefault === (filters.defaults === 'default')),
    );
    const searched = searchByName(
      filtered.map((row) => ({
        row,
        name: `${row.name} ${row.product.label ?? ''} ${row.storeName}`,
      })),
      query,
    ).map(({ row }) => row);
    const direction = order === 'natural' ? 1 : -1;

    return [...searched].sort((a, b) => direction * COMPARATORS[sort](a, b));
  }, [rows, filters, query, sort, order]);

  const pagingKey = JSON.stringify([filters, query.trim(), sort, order]);
  const limit = paging.key === pagingKey ? paging.limit : LIST_PAGE_SIZE;
  const visible = matching.slice(0, limit);
  const hiddenCount = matching.length - visible.length;
  const groups = useMemo(() => {
    if (sort !== 'store') {
      return [];
    }
    const byStore = visible.reduce(
      (acc, row) =>
        acc.set(row.storeName, [...(acc.get(row.storeName) ?? []), row]),
      new Map<string, ProductRowData[]>(),
    );
    return [...byStore.entries()].map(([storeName, items]) => ({
      storeName,
      items,
    }));
  }, [visible, sort]);

  const familyOptions = useMemo(() => {
    const present = new Set(rows.map((row) => row.familyId));
    return families
      .filter((family) => present.has(family.id))
      .map((family) => ({ value: family.id, label: family.name }));
  }, [rows, families]);
  const storeOptions = useMemo(() => {
    const present = new Set(products.map((product) => product.storeId));
    return allStores
      .filter((store) => present.has(store.id))
      .map((store) => ({ value: store.id, label: store.name }));
  }, [products, allStores]);

  const activeFilters = [
    ...filters.storeIds.map((id) => ({
      key: `store:${id}`,
      label: storesById.get(id)?.name ?? REMOVED_STORE,
    })),
    ...filters.familyIds.map((id) => ({
      key: `family:${id}`,
      label:
        families.find((family) => family.id === id)?.name ?? 'Removed family',
    })),
    ...(filters.defaults === 'any'
      ? []
      : [
          {
            key: 'defaults',
            label:
              DEFAULT_CHOICES.find(
                (choice) => choice.value === filters.defaults,
              )?.label ?? '',
          },
        ]),
  ];
  const removeFilter = (key: string) =>
    setFilters((current) => {
      if (key === 'defaults') {
        return { ...current, defaults: 'any' };
      }
      const [kind, id] = key.split(/:(.*)/s);
      return kind === 'store'
        ? { ...current, storeIds: current.storeIds.filter((s) => s !== id) }
        : { ...current, familyIds: current.familyIds.filter((f) => f !== id) };
    });
  const clearFilters = () => setFilters(NO_FILTERS);
  const hasNarrowing = activeFilters.length > 0 || query.trim() !== '';

  const editing = editingId ? (productsById.get(editingId) ?? null) : null;
  const editingIngredient = editing
    ? (ingredientsById.get(editing.ingredientId) ?? null)
    : null;
  const newIngredient = newIngredientId
    ? (ingredientsById.get(newIngredientId) ?? null)
    : null;

  const getSubtitle = () => {
    if (products.length === 0) {
      return undefined;
    }
    const noun = products.length === 1 ? 'product' : 'products';
    return hasNarrowing
      ? `${matching.length} of ${products.length} ${noun}`
      : `${products.length} ${noun}`;
  };

  const renderRow = (row: ProductRowData, showStore: boolean) => (
    <li key={row.product.id}>
      <ProductRow row={row} showStore={showStore} onOpen={setEditingId} />
    </li>
  );

  const getBody = () => {
    if (products.length === 0) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Add a product for an ingredient and it shows up here, grouped by where
          you buy it.
        </p>
      );
    }
    if (matching.length === 0) {
      return (
        <div className='space-y-3 py-6 text-center'>
          <p className='text-muted-foreground text-sm wrap-break-word'>
            {query.trim() !== ''
              ? `Nothing matches “${query.trim()}”${activeFilters.length > 0 ? ' with these filters' : ''}.`
              : 'No products match these filters.'}
          </p>
          {activeFilters.length > 0 && (
            <Button
              type='button'
              variant='secondary'
              className='h-10'
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          )}
        </div>
      );
    }
    if (sort === 'store') {
      return groups.map((group) => (
        <section
          key={group.storeName}
          aria-label={group.storeName}
          className='space-y-1'
        >
          <SectionDivider label={group.storeName} />
          <ul className='divide-border divide-y'>
            {group.items.map((row) => renderRow(row, false))}
          </ul>
        </section>
      ));
    }
    return (
      <ul className='divide-border divide-y'>
        {visible.map((row) => renderRow(row, true))}
      </ul>
    );
  };

  const list = (
    <>
      {getBody()}
      {hiddenCount > 0 && (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='h-10 px-0!'
          onClick={() =>
            setPaging({ key: pagingKey, limit: limit + LIST_PAGE_SIZE })
          }
        >
          Show {Math.min(hiddenCount, LIST_PAGE_SIZE)} more
        </Button>
      )}
    </>
  );

  return (
    <Subview title='Products' onClose={closeSubview}>
      <div className='space-y-4'>
        <SectionHeader
          title='Products'
          subtitle={getSubtitle()}
          action={
            <Button
              type='button'
              size='sm'
              rounded='full'
              className='gap-1'
              onClick={() => setIsPicking(true)}
            >
              <Plus className='h-4 w-4' aria-hidden='true' />
              New product
            </Button>
          }
        />
        {hasControls && (
          <FilterBar
            query={query}
            onQueryChange={setQuery}
            searchPlaceholder='Search'
            filterLabel='Filter products'
            activeFilters={activeFilters}
            onRemoveFilter={removeFilter}
            onClearFilters={clearFilters}
            doneLabel={`Show ${matching.length} ${matching.length === 1 ? 'product' : 'products'}`}
            trailing={
              <SortControl
                label='Sort products'
                options={SORT_CHOICES}
                value={sort}
                defaultValue={DEFAULT_SORT}
                onChange={setSort}
                getOrderOptions={getOrderOptions}
                order={order}
                onOrderChange={setOrder}
              />
            }
          >
            {storeOptions.length > 1 && (
              <FilterSection title='Store'>
                <MultiPillGroup
                  label='Stores'
                  options={storeOptions}
                  values={filters.storeIds}
                  onChange={(storeIds) =>
                    setFilters((current) => ({ ...current, storeIds }))
                  }
                />
              </FilterSection>
            )}
            {familyOptions.length > 1 && (
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
            <FilterSection title='Which product'>
              <PillGroup
                label='Which product'
                options={DEFAULT_CHOICES}
                value={filters.defaults}
                onChange={(defaults) =>
                  setFilters((current) => ({ ...current, defaults }))
                }
              />
            </FilterSection>
          </FilterBar>
        )}
        {list}
      </div>
      {isPicking && (
        <FormSheet
          isOpen
          onClose={() => setIsPicking(false)}
          title='New product'
        >
          <div className='space-y-3 pb-4'>
            <p className='text-muted-foreground text-sm'>
              Which ingredient is it for?
            </p>
            <ItemSearch
              uid={uid}
              autoFocus
              onPick={(ingredientId) => {
                setIsPicking(false);
                setNewIngredientId(ingredientId);
              }}
            />
          </div>
        </FormSheet>
      )}
      {newIngredient && (
        <ProductFormSheet
          key={`new-${newIngredient.id}`}
          uid={uid}
          ingredient={newIngredient}
          product={null}
          onClose={() => setNewIngredientId(null)}
        />
      )}
      {editing && editingIngredient && (
        <ProductFormSheet
          key={editing.id}
          uid={uid}
          ingredient={editingIngredient}
          product={editing}
          onClose={() => setEditingId(null)}
        />
      )}
    </Subview>
  );
}

export default ProductsSubview;
