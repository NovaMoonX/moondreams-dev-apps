import { useMemo, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

import Pill from '@/components/Pill';
import { PillOptions } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { CATALOG_STORES, CATALOG_STORES_BY_ID } from '@apps/pinch/catalog/catalogStores';
import StoreLogo from '@apps/pinch/components/shared/StoreLogo';
import { MAX_NAME_LENGTH } from '@apps/pinch/constants';
import { ensureCatalogStore, saveStore } from '@apps/pinch/store/actions/storeActions';
import { selectStores, selectStoresById } from '@apps/pinch/store/selectors';
import { searchByName } from '@apps/pinch/utils/catalogSearch';

interface StorePickerProps {
  uid: string;
  /** The chosen store's id, or null before anything is chosen. */
  value: string | null;
  onChange: (storeId: string | null) => void;
}

/** Picks where something is bought: the person's own stores as logo pills, and a dashed "New store" pill that opens the well-known list and a box for one of their own. */
function StorePicker({ uid, value, onChange }: StorePickerProps) {
  const dispatch = useAppDispatch();
  const stores = useAppSelector(selectStores);
  const storesById = useAppSelector(selectStoresById);
  const [isAdding, setIsAdding] = useState(stores.length === 0);
  const [query, setQuery] = useState('');
  const [ownName, setOwnName] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () =>
      stores.map((store) => ({
        value: store.id,
        label: store.name,
        icon: (
          <StoreLogo
            name={store.name}
            domain={store.catalogStoreId ? (CATALOG_STORES_BY_ID.get(store.catalogStoreId)?.domain ?? null) : null}
            imagePath={store.imagePath}
            imageVersion={store.updatedAt}
            size={20}
          />
        ),
      })),
    [stores],
  );
  const matches = useMemo(
    () => searchByName(CATALOG_STORES.filter((catalogStore) => !storesById.has(catalogStore.id)), query),
    [storesById, query],
  );

  const finish = (storeId: string) => {
    onChange(storeId);
    setIsAdding(false);
    setQuery('');
    setOwnName('');
  };

  const addCatalogStore = async (catalogStoreId: string) => {
    setError(null);
    setIsWorking(true);
    try {
      finish(await dispatch(ensureCatalogStore({ uid, catalogStoreId })).unwrap());
    } catch (addError) {
      setError(getErrorMessage(addError, 'Unable to add this store.'));
    } finally {
      setIsWorking(false);
    }
  };

  const addOwnStore = async () => {
    setError(null);
    setIsWorking(true);
    try {
      finish(await dispatch(saveStore({ uid, id: null, name: ownName, imageFile: null, removeImage: false })).unwrap());
    } catch (addError) {
      setError(getErrorMessage(addError, 'Unable to add this store.'));
    } finally {
      setIsWorking(false);
    }
  };

  const creator = (
    <div className='border-border space-y-3 rounded-2xl border p-3'>
      <SearchInput value={query} onChange={setQuery} placeholder='Search well-known stores' />
      {matches.length === 0 ? (
        <p className='text-muted-foreground text-center text-sm wrap-break-word'>Nothing matches “{query.trim()}” on the list.</p>
      ) : (
        <ul className='divide-border max-h-44 divide-y overflow-y-auto'>
          {matches.map((catalogStore) => (
            <li key={catalogStore.id}>
              <Button
                type='button'
                variant='tertiary'
                disabled={isWorking}
                onClick={() => void addCatalogStore(catalogStore.id)}
                className='h-auto min-h-11 w-full justify-start gap-3 px-0! py-1.5 text-left'
              >
                <StoreLogo name={catalogStore.name} domain={catalogStore.domain} size={28} />
                <span className='min-w-0 flex-1 truncate font-medium'>{catalogStore.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className='flex items-center gap-2'>
        <Input
          variant='outline'
          aria-label='A store of your own'
          placeholder='Or name a store of your own'
          maxLength={MAX_NAME_LENGTH}
          value={ownName}
          onChange={(event) => setOwnName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (ownName.trim() !== '') void addOwnStore();
            }
          }}
        />
        <Button type='button' variant='secondary' disabled={isWorking || ownName.trim() === ''} onClick={() => void addOwnStore()}>
          Add
        </Button>
      </div>
      {error && <p className='text-destructive text-sm'>{error}</p>}
    </div>
  );

  if (stores.length === 0) {
    return creator;
  }

  return (
    <div className='space-y-2'>
      <PillOptions
        label='Store'
        options={options}
        isSingle
        selectedCount={value === null ? 0 : 1}
        isSelected={(storeId) => value === storeId}
        onToggle={(storeId) => onChange(value === storeId ? null : storeId)}
        leading={
          <Pill isSelected={isAdding} className='border-primary/60 border border-dashed' onClick={() => setIsAdding((current) => !current)}>
            <Plus className='h-3.5 w-3.5' aria-hidden='true' />
            New store
          </Pill>
        }
      />
      {isAdding && creator}
    </div>
  );
}

export default StorePicker;
