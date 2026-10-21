import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import ProductFormSheet from '@apps/pinch/components/kitchen/ProductFormSheet';
import IngredientIcon from '@apps/pinch/components/shared/IngredientIcon';
import { LIST_SEARCH_THRESHOLD } from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectIngredientsById,
  selectProducts,
  selectProductsById,
  selectStoresById,
} from '@apps/pinch/store/selectors';
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import { formatSize } from '@apps/pinch/utils/productFormat';

const REMOVED_STORE = 'Removed store';

interface ProductsSubviewProps {
  uid: string;
}

function ProductsSubview({ uid }: ProductsSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const products = useAppSelector(selectProducts);
  const productsById = useAppSelector(selectProductsById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const storesById = useAppSelector(selectStoresById);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      products.map((product) => ({
        product,
        name:
          ingredientsById.get(product.ingredientId)?.name ??
          'Removed ingredient',
        storeName: storesById.get(product.storeId)?.name ?? REMOVED_STORE,
      })),
    [products, ingredientsById, storesById],
  );
  const groups = useMemo(() => {
    const shown = searchByName(
      rows.map((row) => ({
        row,
        name: `${row.name} ${row.product.label ?? ''} ${row.storeName}`,
      })),
      query,
    ).map(({ row }) => row);
    const byStore = shown.reduce(
      (acc, row) =>
        acc.set(row.storeName, [...(acc.get(row.storeName) ?? []), row]),
      new Map<string, typeof shown>(),
    );
    return [...byStore.entries()]
      .sort(
        ([a], [b]) =>
          Number(a === REMOVED_STORE) - Number(b === REMOVED_STORE) ||
          a.localeCompare(b),
      )
      .map(([storeName, items]) => ({
        storeName,
        items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [rows, query]);

  const editing = editingId ? (productsById.get(editingId) ?? null) : null;
  const editingIngredient = editing
    ? (ingredientsById.get(editing.ingredientId) ?? null)
    : null;

  return (
    <Subview title='Products' onClose={closeSubview}>
      <div className='space-y-4'>
        <SectionHeader
          title='Products'
          subtitle={
            products.length === 0
              ? undefined
              : `${products.length} ${products.length === 1 ? 'product' : 'products'}`
          }
        />
        {products.length >= LIST_SEARCH_THRESHOLD && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder='Search products'
          />
        )}
        {products.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            Open an ingredient in the Kitchen and tap “Add a product”: it shows
            up here, grouped by where you buy it.
          </p>
        ) : groups.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
            Nothing matches “{query.trim()}”.
          </p>
        ) : (
          groups.map((group) => (
            <section
              key={group.storeName}
              aria-label={group.storeName}
              className='space-y-1'
            >
              <SectionDivider
                label={group.storeName}
                trailing={
                  <span className='text-muted-foreground text-xs'>
                    {group.items.length}
                  </span>
                }
              />
              <ul className='divide-border divide-y'>
                {group.items.map(({ product, name }) => (
                  <li key={product.id}>
                    <Button
                      type='button'
                      variant='tertiary'
                      onClick={() => setEditingId(product.id)}
                      className='h-auto min-h-14 w-full justify-start gap-3 px-0! py-2 text-left'
                    >
                      <IngredientIcon
                        iconKey={
                          ingredientsById.get(product.ingredientId)?.iconKey ??
                          null
                        }
                        size={32}
                      />
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate font-medium'>
                          {name}
                        </span>
                        <span className='text-muted-foreground block truncate text-xs font-normal'>
                          {[
                            product.label,
                            formatSize(product.sizeAmount, product.sizeUnit),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className='font-semibold whitespace-nowrap'>
                        {formatCents(product.priceCents)}
                      </span>
                      <ChevronRight
                        className='text-muted-foreground h-5 w-5 shrink-0'
                        aria-hidden='true'
                      />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
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
