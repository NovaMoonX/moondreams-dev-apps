import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight } from 'lucide-react';

import BackLink from '@/components/BackLink';
import DeleteIconButton from '@/components/DeleteIconButton';
import Field from '@/components/forms/Field';
import FormSheet from '@/components/FormSheet';
import IntroCard from '@/components/IntroCard';
import ModalFooterActions from '@/components/ModalFooterActions';
import SearchInput from '@/components/SearchInput';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  COLLECTION_NOUN,
  COLLECTION_NOUN_PLURAL,
  COLLECTIONS_TITLE,
  LIST_SEARCH_THRESHOLD,
  MAX_COLLECTION_LABEL_LENGTH,
} from '@apps/pinch/constants';
import {
  removeCollection,
  renameCollection,
} from '@apps/pinch/store/actions/collectionActions';
import {
  selectCollectionCounts,
  selectCollections,
  selectRecipes,
} from '@apps/pinch/store/selectors';
import type { Collection } from '@apps/pinch/types';
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import { findCollectionByLabel } from '@apps/pinch/utils/collections';
import { joinSourceNames } from '@apps/pinch/utils/shopping';

const { custom } = FormFactories;

const TITLES_SHOWN = 2;

const getRecipesLine = (count: number, titles: string[]) => {
  if (count === 0) return 'Not on any recipe';
  const noun = count === 1 ? 'recipe' : 'recipes';
  return `${count} ${noun} · ${joinSourceNames(titles, TITLES_SHOWN)}`;
};

const getRemovedText = (label: string, count: number) => {
  if (count === 0) return `Deleted “${label}”`;
  return `Deleted “${label}”. It came off ${count === 1 ? '1 recipe' : `${count} recipes`}.`;
};

interface CollectionEditViewProps {
  uid: string;
  collection: Collection;
  recipeCount: number;
  onBack: () => void;
}

function CollectionEditView({
  uid,
  collection,
  recipeCount,
  onBack,
}: CollectionEditViewProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const collections = useAppSelector(selectCollections);
  const [label, setLabel] = useState(collection.label);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = label.trim();
  const duplicate = findCollectionByLabel(collections, trimmed, collection.id);
  const isChanged = trimmed !== collection.label;
  const isValid = trimmed !== '' && duplicate === null;

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(
        renameCollection({ uid, id: collection.id, label }),
      ).unwrap();
      onBack();
    } catch (submitError) {
      setError(
        getErrorMessage(submitError, `Unable to save this ${COLLECTION_NOUN}.`),
      );
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    const getMessage = () => {
      if (recipeCount === 0) {
        return `Delete “${collection.label}”? It isn't on any recipe, and this can't be undone.`;
      }
      const noun = recipeCount === 1 ? '1 recipe' : `${recipeCount} recipes`;
      return `“${collection.label}” is on ${noun}. ${recipeCount === 1 ? 'It stays' : 'They stay'}, and only come${recipeCount === 1 ? 's' : ''} out of this ${COLLECTION_NOUN}. This can't be undone.`;
    };
    const confirmed = await confirm({
      title: `Delete ${COLLECTION_NOUN}`,
      message: getMessage(),
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const { recipeCount: removed } = await dispatch(
        removeCollection({ uid, id: collection.id }),
      ).unwrap();
      addToast({
        title: getRemovedText(collection.label, removed),
        type: 'success',
      });
      onBack();
    } catch (deleteError) {
      setError(
        getErrorMessage(
          deleteError,
          `Unable to delete this ${COLLECTION_NOUN}.`,
        ),
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className='space-y-4'>
      <BackLink onBack={onBack} />
      <Form
        id='pinch-collection'
        form={[
          custom({
            name: 'label',
            label: '',
            renderComponent: (props) => (
              <Field label='Name'>
                {(id) => (
                  <Input
                    id={id}
                    variant='outline'
                    placeholder='High-protein'
                    maxLength={MAX_COLLECTION_LABEL_LENGTH}
                    value={String(props.value)}
                    onChange={(event) =>
                      props.onValueChange(event.target.value)
                    }
                  />
                )}
              </Field>
            ),
          }),
        ]}
        initialData={{ label: collection.label }}
        columns={1}
        onDataChange={(data) =>
          setLabel(String((data as { label?: string }).label ?? ''))
        }
        onSubmit={() => {
          void handleSubmit();
        }}
        submitButton={
          <ModalFooterActions
            note={
              duplicate &&
              `You already have a ${COLLECTION_NOUN} called “${duplicate.label}”.`
            }
            leftActions={
              <DeleteIconButton
                label={`Delete ${collection.label}`}
                onClick={() => void handleDelete()}
                disabled={isSubmitting}
              />
            }
            cancelAction={
              <Button
                type='button'
                variant='secondary'
                onClick={onBack}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='submit'
                loading={isSubmitting}
                disabled={isSubmitting || !isValid || !isChanged}
              >
                Save
              </Button>
            }
          />
        }
      />
      {error && <p className='text-destructive text-sm'>{error}</p>}
    </div>
  );
}

interface CollectionsSheetProps {
  uid: string;
  onClose: () => void;
}

function CollectionsSheet({ uid, onClose }: CollectionsSheetProps) {
  const collections = useAppSelector(selectCollections);
  const counts = useAppSelector(selectCollectionCounts).byCollection;
  const recipes = useAppSelector(selectRecipes);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const shown = useMemo(
    () =>
      searchByName(
        collections.map((collection) => ({
          name: collection.label,
          collection,
        })),
        query,
      ).map(({ collection }) => collection),
    [collections, query],
  );
  const titlesByCollection = useMemo(
    () =>
      recipes.reduce(
        (acc, recipe) =>
          (recipe.collectionIds ?? []).reduce(
            (inner, id) =>
              inner.set(id, [...(inner.get(id) ?? []), recipe.title]),
            acc,
          ),
        new Map<string, string[]>(),
      ),
    [recipes],
  );
  const editing =
    collections.find((collection) => collection.id === editingId) ?? null;
  const closeEdit = () => setEditingId(null);

  return (
    <FormSheet isOpen onClose={onClose} title={COLLECTIONS_TITLE}>
      {editing ? (
        <CollectionEditView
          key={editing.id}
          uid={uid}
          collection={editing}
          recipeCount={counts.get(editing.id) ?? 0}
          onBack={closeEdit}
        />
      ) : (
        <div className='space-y-4'>
          <div className='flex max-h-[max(12rem,calc(92dvh-17rem))] flex-col gap-3'>
            {collections.length > 0 &&
              collections.length < LIST_SEARCH_THRESHOLD && (
                <IntroCard icon='🗂️' lead='Sets of recipes you make yourself.'>
                  Rename one and every recipe in it follows. Deleting one never
                  deletes a recipe.
                </IntroCard>
              )}
            {collections.length >= LIST_SEARCH_THRESHOLD && (
              <div className='shrink-0'>
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder={`Search your ${COLLECTION_NOUN_PLURAL}`}
                />
              </div>
            )}
            {collections.length === 0 ? (
              <p className='text-muted-foreground py-6 text-center text-sm'>
                {`No ${COLLECTION_NOUN_PLURAL} left. Make one from a recipe's form, under “${COLLECTIONS_TITLE}”.`}
              </p>
            ) : shown.length === 0 ? (
              <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
                Nothing matches “{query.trim()}”.
              </p>
            ) : (
              <ul className='border-border divide-border min-h-0 flex-1 divide-y overflow-y-auto rounded-2xl border px-3'>
                {shown.map((collection) => (
                  <li key={collection.id}>
                    <Button
                      type='button'
                      variant='tertiary'
                      aria-label={`Change ${collection.label}`}
                      onClick={() => setEditingId(collection.id)}
                      className='h-auto min-h-16 w-full items-start justify-start gap-3 px-0! py-3 text-left'
                    >
                      <span
                        className='mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--pinch-drizzle-soft)]'
                        aria-hidden='true'
                      >
                        🗂️
                      </span>
                      <span className='flex min-h-11 min-w-0 flex-1 flex-col justify-center'>
                        <span className='text-foreground block font-medium wrap-break-word'>
                          {collection.label}
                        </span>
                        <span className='text-muted-foreground line-clamp-2 block text-sm font-normal'>
                          {getRecipesLine(
                            counts.get(collection.id) ?? 0,
                            titlesByCollection.get(collection.id) ?? [],
                          )}
                        </span>
                      </span>
                      <ChevronRight
                        className='text-muted-foreground mt-3 mr-2.5 h-5 w-5 shrink-0'
                        aria-hidden='true'
                      />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ModalFooterActions
            rightActions={
              <Button type='button' onClick={onClose}>
                Done
              </Button>
            }
          />
        </div>
      )}
    </FormSheet>
  );
}

export default CollectionsSheet;
