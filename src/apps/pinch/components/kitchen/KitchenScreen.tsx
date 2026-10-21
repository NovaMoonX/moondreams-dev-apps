import { memo, useMemo, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import {
  ChevronRight,
  ClipboardCopy,
  Plus,
  ShoppingCart,
  Store,
} from 'lucide-react';

import CopySheet from '@/components/CopySheet';
import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import { useAppSelector } from '@/store';
import FamilyGroup from '@apps/pinch/components/kitchen/FamilyGroup';
import IngredientDrawer from '@apps/pinch/components/kitchen/IngredientDrawer';
import IngredientFormSheet from '@apps/pinch/components/kitchen/IngredientFormSheet';
import ProductFormSheet from '@apps/pinch/components/kitchen/ProductFormSheet';
import { KITCHEN_VIEW_LABELS, KITCHEN_VIEWS } from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectDefaultProducts,
  selectIngredientFamilies,
  selectIngredients,
  selectIngredientsById,
  selectProducts,
  selectProductsById,
  selectStores,
  selectUsedIngredientIds,
} from '@apps/pinch/store/selectors';
import type { KitchenView } from '@apps/pinch/types';
import { ingredientsMarkdown } from '@apps/pinch/utils/markdown/ingredientsMarkdown';
import {
  groupByFamily,
  searchIngredients,
} from '@apps/pinch/utils/catalogSearch';

const EAGER_GROUPS = 3;
const VIEW_OPTIONS = KITCHEN_VIEWS.map((value) => ({
  value,
  label: KITCHEN_VIEW_LABELS[value],
}));

type Overlay =
  | { kind: 'details'; id: string }
  | { kind: 'copy' }
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
      className='h-12 min-w-0 justify-start gap-2 rounded-2xl px-3'
    >
      {icon}
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
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const ingredients = useAppSelector(selectIngredients);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const families = useAppSelector(selectIngredientFamilies);
  const storeCount = useAppSelector(selectStores).length;
  const productCount = useAppSelector(selectProducts).length;
  const productsById = useAppSelector(selectProductsById);
  const defaultProducts = useAppSelector(selectDefaultProducts);
  const usedIds = useAppSelector(selectUsedIngredientIds);
  const { openSubview } = usePinchOverlay();

  const trimmed = query.trim();
  const scoped = useMemo(
    () =>
      view === 'all'
        ? ingredients
        : ingredients.filter(
            (ingredient) =>
              ingredient.isCustom ||
              ingredient.isAdjusted ||
              defaultProducts.has(ingredient.id),
          ),
    [ingredients, view, defaultProducts],
  );
  const groups = useMemo(
    () => groupByFamily(searchIngredients(scoped, trimmed), families),
    [scoped, trimmed, families],
  );

  const getEmptyState = () => {
    if (trimmed !== '') {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
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
          variant='link'
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
        title='Ingredients'
        subtitle={`${ingredients.length} ingredients, ready to use`}
        action={
          <div className='flex items-center gap-1'>
            <Button
              type='button'
              variant='tertiary'
              size='icon'
              rounded='full'
              aria-label='Copy my ingredients'
              className='size-10 p-0'
              onClick={() => setOverlay({ kind: 'copy' })}
            >
              <ClipboardCopy className='h-5 w-5' aria-hidden='true' />
            </Button>
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
        }
      />
      <div className='grid grid-cols-2 gap-2'>
        <EntryRow
          icon={<Store className='h-5 w-5 shrink-0' aria-hidden='true' />}
          label='Stores'
          count={storeCount}
          onClick={() => openSubview({ kind: 'stores' })}
        />
        <EntryRow
          icon={
            <ShoppingCart className='h-5 w-5 shrink-0' aria-hidden='true' />
          }
          label='Products'
          count={productCount}
          onClick={() => openSubview({ kind: 'products' })}
        />
      </div>
      <PillGroup
        label='Which ingredients'
        options={VIEW_OPTIONS}
        value={view}
        onChange={setView}
        isThin
      />
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder='Search ingredients'
      />
      {groups.length === 0 ? (
        getEmptyState()
      ) : (
        <div className='space-y-4'>
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
      {overlay?.kind === 'copy' && (
        <CopySheet
          title='My ingredients'
          text={ingredientsMarkdown(
            ingredients,
            families,
            (ingredient) =>
              ingredient.isCustom ||
              ingredient.isAdjusted ||
              defaultProducts.has(ingredient.id) ||
              usedIds.has(ingredient.id),
          )}
          note='Just the names, grouped by family, so a chat knows what is in your kitchen. No prices, stores or nutrition.'
          onClose={() => setOverlay(null)}
        />
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
