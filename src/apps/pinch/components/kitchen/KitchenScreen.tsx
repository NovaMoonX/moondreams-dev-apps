import { memo, useMemo, useState } from 'react';

import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import FamilyGroup from '@apps/pinch/components/kitchen/FamilyGroup';
import IngredientDrawer from '@apps/pinch/components/kitchen/IngredientDrawer';
import { CATALOG_INGREDIENTS } from '@apps/pinch/catalog';
import { groupByFamily, searchCatalog } from '@apps/pinch/utils/catalogSearch';

const EAGER_GROUPS = 3;

function KitchenScreen() {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const trimmed = query.trim();
  const groups = useMemo(
    () => groupByFamily(searchCatalog(trimmed)),
    [trimmed],
  );

  return (
    <div className='space-y-4'>
      <SectionHeader
        title='Ingredients'
        subtitle={`${CATALOG_INGREDIENTS.length} everyday ingredients, ready to use`}
      />
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder='Search ingredients'
      />
      {groups.length === 0 ? (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Nothing matches “{trimmed}” yet. Try another name.
        </p>
      ) : (
        <div className='space-y-4'>
          {groups.map((group, index) => (
            <FamilyGroup
              key={group.family.id}
              group={group}
              isEager={index < EAGER_GROUPS}
              onOpen={setOpenId}
            />
          ))}
        </div>
      )}
      {openId && (
        <IngredientDrawer
          key={openId}
          ingredientId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

export default memo(KitchenScreen);
