import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Plus } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import StoreFormSheet from '@apps/pinch/components/kitchen/StoreFormSheet';
import StoreLogo from '@apps/pinch/components/shared/StoreLogo';
import { CATALOG_STORES_BY_ID } from '@apps/pinch/catalog/catalogStores';
import { LIST_SEARCH_THRESHOLD } from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { selectStores } from '@apps/pinch/store/selectors';
import { searchByName } from '@apps/pinch/utils/catalogSearch';

type FormState = { storeId: string | null };

interface StoresSubviewProps {
  uid: string;
}

function StoresSubview({ uid }: StoresSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const stores = useAppSelector(selectStores);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormState | null>(null);

  const shown = useMemo(() => searchByName(stores, query), [stores, query]);
  const editing = form?.storeId
    ? (stores.find((store) => store.id === form.storeId) ?? null)
    : null;

  return (
    <Subview title='Stores' onClose={closeSubview}>
      <div className='space-y-4'>
        <SectionHeader
          title='Stores'
          subtitle={
            stores.length === 0
              ? undefined
              : `${stores.length} ${stores.length === 1 ? 'store' : 'stores'}`
          }
          action={
            <Button
              type='button'
              size='sm'
              rounded='full'
              className='gap-1'
              onClick={() => setForm({ storeId: null })}
            >
              <Plus className='h-4 w-4' aria-hidden='true' />
              Add
            </Button>
          }
        />
        {stores.length >= LIST_SEARCH_THRESHOLD && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder='Search your stores'
          />
        )}
        {stores.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            Add the shops you buy from, and their prices will have somewhere to
            live.
          </p>
        ) : shown.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
            Nothing matches “{query.trim()}”.
          </p>
        ) : (
          <ul className='divide-border divide-y'>
            {shown.map((store) => (
              <li key={store.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  onClick={() => setForm({ storeId: store.id })}
                  className='h-auto min-h-14 w-full justify-start gap-3 px-0! py-2 text-left'
                >
                  <StoreLogo
                    name={store.name}
                    domain={
                      store.catalogStoreId
                        ? (CATALOG_STORES_BY_ID.get(store.catalogStoreId)
                            ?.domain ?? null)
                        : null
                    }
                    imagePath={store.imagePath}
                    imageVersion={store.updatedAt}
                    size={40}
                  />
                  <span className='text-foreground min-w-0 flex-1 truncate font-medium'>
                    {store.name}
                  </span>
                  <ChevronRight
                    className='text-muted-foreground h-5 w-5 shrink-0'
                    aria-hidden='true'
                  />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {form && (
        <StoreFormSheet
          key={form.storeId ?? 'new'}
          uid={uid}
          store={editing}
          onClose={() => setForm(null)}
        />
      )}
    </Subview>
  );
}

export default StoresSubview;
