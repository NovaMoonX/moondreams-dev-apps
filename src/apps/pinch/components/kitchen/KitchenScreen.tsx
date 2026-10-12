import { memo, useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import { useAppSelector } from '@/store';
import FamilyGroup from '@apps/pinch/components/kitchen/FamilyGroup';
import IngredientDrawer from '@apps/pinch/components/kitchen/IngredientDrawer';
import IngredientFormSheet from '@apps/pinch/components/kitchen/IngredientFormSheet';
import { KITCHEN_VIEW_LABELS, KITCHEN_VIEWS } from '@apps/pinch/constants';
import {
  selectIngredientFamilies,
  selectIngredients,
  selectIngredientsById,
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

type Overlay =
  { kind: 'details'; id: string } | { kind: 'form'; id: string | null };

interface KitchenScreenProps {
  uid: string;
}

function KitchenScreen({ uid }: KitchenScreenProps) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<KitchenView>('yours');
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const ingredients = useAppSelector(selectIngredients);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const families = useAppSelector(selectIngredientFamilies);

  const trimmed = query.trim();
  const scoped = useMemo(
    () =>
      view === 'all'
        ? ingredients
        : ingredients.filter(
            (ingredient) => ingredient.isCustom || ingredient.isAdjusted,
          ),
    [ingredients, view],
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
        }
      />
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
      {overlay?.kind === 'details' && (
        <IngredientDrawer
          key={overlay.id}
          ingredientId={overlay.id}
          onClose={() => setOverlay(null)}
          onModify={(id) => setOverlay({ kind: 'form', id })}
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
    </div>
  );
}

export default memo(KitchenScreen);
