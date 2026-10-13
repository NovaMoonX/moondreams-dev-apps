import { useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Plus } from 'lucide-react';

import DeleteIconButton from '@/components/DeleteIconButton';
import PhotoPicker from '@/components/forms/PhotoPicker';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SearchInput from '@/components/SearchInput';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { CATALOG_STORES } from '@apps/pinch/catalog/catalogStores';
import StoreLogo from '@apps/pinch/components/shared/StoreLogo';
import { MAX_NAME_LENGTH } from '@apps/pinch/constants';
import { useStorageImageUrl } from '@apps/pinch/hooks/useStorageImageUrl';
import {
  ensureCatalogStore,
  removeStore,
  saveStore,
} from '@apps/pinch/store/actions/storeActions';
import { getUsage } from '@apps/pinch/store/actions/usageActions';
import { describeUsage, isInUse } from '@apps/pinch/utils/references';
import { selectStores } from '@apps/pinch/store/selectors';
import type { Store } from '@apps/pinch/types';
import { searchByName } from '@apps/pinch/utils/catalogSearch';

const { custom, input } = FormFactories;

interface StoreFormSheetProps {
  uid: string;
  /** The store being changed; null adds a new one. */
  store: Store | null;
  onClose: () => void;
}

interface OwnStoreFormProps {
  uid: string;
  store: Store | null;
  onClose: () => void;
}

function OwnStoreForm({ uid, store, onClose }: OwnStoreFormProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const existingUrl = useStorageImageUrl(
    store?.imagePath ?? null,
    store?.updatedAt ?? 0,
  );
  const upload = useImageUpload(null);
  const [isRemoved, setIsRemoved] = useState(false);
  const [name, setName] = useState(store?.name ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photoUrl = upload.previewUrl ?? (isRemoved ? null : existingUrl);
  const isFormComplete = name.trim() !== '' && name.length <= MAX_NAME_LENGTH;

  const handleDelete = async () => {
    if (!store) {
      return;
    }
    const usage = await dispatch(getUsage({ uid, kind: 'STORE', id: store.id }))
      .unwrap()
      .catch(() => null);
    if (usage === null) {
      setError(
        "We couldn't check whether this store is in use. Try again in a moment.",
      );
      return;
    }

    const isUsed = isInUse(usage);
    const confirmed = await confirm({
      title: isUsed ? 'Hide store' : 'Delete store',
      message: isUsed
        ? `"${store.name}" is used by ${describeUsage(usage)}, so it will be hidden, not erased. They keep their price, size and where they were bought.`
        : `Delete "${store.name}"? This action cannot be undone.`,
      confirmText: isUsed ? 'Hide' : 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(removeStore({ uid, id: store.id })).unwrap();
      onClose();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this store.'));
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(
        saveStore({
          uid,
          id: store?.id ?? null,
          name,
          imageFile: upload.file,
          removeImage: isRemoved && upload.file === null,
        }),
      ).unwrap();
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this store.'));
      setIsSubmitting(false);
    }
  };

  const fields = [
    input({
      name: 'name',
      label: 'Name',
      variant: 'outline',
      placeholder: 'Green Market',
    }),
    custom({
      name: 'image',
      label: 'Logo or photo',
      renderComponent: () => (
        <PhotoPicker
          photoUrl={photoUrl}
          initials={name.trim().charAt(0).toUpperCase()}
          error={upload.error}
          disabled={isSubmitting}
          onSelect={(file) => {
            upload.pick(file);
            setIsRemoved(false);
          }}
          onRemove={() => {
            upload.clear();
            setIsRemoved(true);
          }}
        />
      ),
    }),
  ];

  return (
    <>
      <Form
        id='pinch-store'
        form={fields}
        initialData={{ name: store?.name ?? '', image: null }}
        columns={1}
        onDataChange={(data) =>
          setName(String((data as { name?: string }).name ?? ''))
        }
        onSubmit={() => {
          void handleSubmit();
        }}
        submitButton={
          <ModalFooterActions
            leftActions={
              store && (
                <DeleteIconButton
                  onClick={() => void handleDelete()}
                  disabled={isSubmitting}
                />
              )
            }
            cancelAction={
              <Button
                type='button'
                variant='secondary'
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='submit'
                loading={isSubmitting}
                disabled={isSubmitting || !isFormComplete}
              >
                {store ? 'Save' : 'Add'}
              </Button>
            }
          />
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </>
  );
}

interface CatalogStoreViewProps {
  uid: string;
  store: Store;
  onClose: () => void;
}

function CatalogStoreView({ uid, store, onClose }: CatalogStoreViewProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const [error, setError] = useState<string | null>(null);
  const catalogStore = CATALOG_STORES.find(
    (candidate) => candidate.id === store.catalogStoreId,
  );

  const handleDelete = async () => {
    const usage = await dispatch(getUsage({ uid, kind: 'STORE', id: store.id }))
      .unwrap()
      .catch(() => null);
    if (usage === null) {
      setError(
        "We couldn't check whether this store is in use. Try again in a moment.",
      );
      return;
    }

    const isUsed = isInUse(usage);
    const confirmed = await confirm({
      title: isUsed ? 'Hide store' : 'Delete store',
      message: isUsed
        ? `"${store.name}" is used by ${describeUsage(usage)}, so it will be hidden, not erased. They keep their price, size and where they were bought. You can add it again from the list.`
        : `Delete "${store.name}"? You can add it again from the list.`,
      confirmText: isUsed ? 'Hide' : 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await dispatch(removeStore({ uid, id: store.id })).unwrap();
      onClose();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this store.'));
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-3'>
        <StoreLogo
          name={store.name}
          domain={catalogStore?.domain ?? null}
          size={48}
        />
        <div className='min-w-0'>
          <p className='truncate font-medium'>{store.name}</p>
          <p className='text-muted-foreground text-sm'>
            A well-known store, so its name and logo come from the list.
          </p>
        </div>
      </div>
      {error && <p className='text-destructive text-sm'>{error}</p>}
      <ModalFooterActions
        leftActions={<DeleteIconButton onClick={() => void handleDelete()} />}
        rightActions={
          <Button type='button' onClick={onClose}>
            Done
          </Button>
        }
      />
    </div>
  );
}

interface CatalogPickerProps {
  uid: string;
  onOwn: () => void;
  onClose: () => void;
}

function CatalogPicker({ uid, onOwn, onClose }: CatalogPickerProps) {
  const dispatch = useAppDispatch();
  const stores = useAppSelector(selectStores);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const matches = searchByName(CATALOG_STORES, query);

  const handlePick = async (catalogStoreId: string) => {
    setError(null);
    try {
      await dispatch(ensureCatalogStore({ uid, catalogStoreId })).unwrap();
      onClose();
    } catch (pickError) {
      setError(getErrorMessage(pickError, 'Unable to add this store.'));
    }
  };

  return (
    <div className='space-y-3'>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder='Search well-known stores'
      />
      {matches.length === 0 ? (
        <p className='text-muted-foreground py-2 text-center text-sm wrap-break-word'>
          Nothing matches “{query.trim()}” on the list.
        </p>
      ) : (
        <ul className='divide-border max-h-64 divide-y overflow-y-auto'>
          {matches.map((catalogStore) => {
            const isAdded = stores.some(
              (store) => store.id === catalogStore.id,
            );
            return (
              <li key={catalogStore.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  disabled={isAdded}
                  onClick={() => void handlePick(catalogStore.id)}
                  className='h-auto min-h-12 w-full justify-start gap-3 px-0! py-2 text-left'
                >
                  <StoreLogo
                    name={catalogStore.name}
                    domain={catalogStore.domain}
                    size={32}
                  />
                  <span className='min-w-0 flex-1 truncate font-medium'>
                    {catalogStore.name}
                  </span>
                  {isAdded && (
                    <span className='text-muted-foreground text-xs font-normal'>
                      Added
                    </span>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className='text-destructive text-sm'>{error}</p>}
      <Button
        type='button'
        variant='tertiary'
        className='h-10 gap-1.5 px-0!'
        onClick={onOwn}
      >
        <Plus className='h-4 w-4' aria-hidden='true' />
        Can't find it? Add your own
      </Button>
    </div>
  );
}

function StoreFormSheet({ uid, store, onClose }: StoreFormSheetProps) {
  const [isOwn, setIsOwn] = useState(false);

  const getBody = () => {
    if (store?.catalogStoreId)
      return <CatalogStoreView uid={uid} store={store} onClose={onClose} />;
    if (store || isOwn)
      return <OwnStoreForm uid={uid} store={store} onClose={onClose} />;
    return (
      <CatalogPicker uid={uid} onOwn={() => setIsOwn(true)} onClose={onClose} />
    );
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Store'>
      {getBody()}
    </FormSheet>
  );
}

export default StoreFormSheet;
