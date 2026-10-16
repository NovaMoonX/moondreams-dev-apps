import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight, Pencil } from 'lucide-react';

import DeleteIconButton from '@/components/DeleteIconButton';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import Subview from '@/components/Subview';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import SourceFormSheet from '@apps/pinch/components/recipes/SourceFormSheet';
import { LIST_SEARCH_THRESHOLD } from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { announceSourceShown } from '@apps/pinch/hooks/useSourceShown';
import { removeSource } from '@apps/pinch/store/actions/sourceActions';
import { selectSourceCounts, selectSources } from '@apps/pinch/store/selectors';
import type { Source } from '@apps/pinch/types';
import { searchByName } from '@apps/pinch/utils/catalogSearch';

interface SourcesSubviewProps {
  uid: string;
}

/** The sources with their recipe counts: a row shows that source's recipes, the pencil renames or deletes it. A source is made from a recipe's form, where it is used. */
function SourcesSubview({ uid }: SourcesSubviewProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { closeSubview } = usePinchOverlay();
  const sources = useAppSelector(selectSources);
  const counts = useAppSelector(selectSourceCounts).bySource;
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(
    () =>
      searchByName(
        sources.map((source) => ({ name: source.label, source })),
        query,
      ).map(({ source }) => source),
    [sources, query],
  );
  const editing = sources.find((source) => source.id === editingId) ?? null;

  const showRecipes = (source: Source) => {
    announceSourceShown(source.id);
    closeSubview();
  };

  const handleDelete = async (source: Source) => {
    const confirmed = await confirm({
      title: 'Delete source',
      message: `Delete “${source.label}”? It isn't on any recipe, and this can't be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setError(null);
    setDeletingId(source.id);
    try {
      await dispatch(removeSource({ uid, id: source.id })).unwrap();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this source.'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Subview title='Sources' onClose={closeSubview}>
      <div className='space-y-4'>
        <SectionHeader
          title='Sources'
          subtitle={
            sources.length === 0
              ? undefined
              : `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`
          }
        />
        {sources.length >= LIST_SEARCH_THRESHOLD && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder='Search your sources'
          />
        )}
        {sources.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            No sources left. Add one from a recipe's form, under “Where it's
            from”.
          </p>
        ) : shown.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
            Nothing matches “{query.trim()}”.
          </p>
        ) : (
          <ul className='divide-border divide-y'>
            {shown.map((source) => {
              const count = counts.get(source.id) ?? 0;
              const summary = (
                <>
                  <span
                    className='flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--pinch-drizzle-soft)]'
                    aria-hidden='true'
                  >
                    📖
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='text-foreground block font-medium wrap-break-word'>
                      {source.label}
                    </span>
                    <span className='text-muted-foreground block text-xs font-normal'>
                      {count === 0
                        ? 'Not on any recipe'
                        : `${count} ${count === 1 ? 'recipe' : 'recipes'}`}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={source.id} className='flex items-start gap-1'>
                  {count === 0 ? (
                    <div className='flex min-h-14 min-w-0 flex-1 items-start gap-3 py-2'>
                      {summary}
                    </div>
                  ) : (
                    <Button
                      type='button'
                      variant='tertiary'
                      aria-label={`Show the ${count} ${count === 1 ? 'recipe' : 'recipes'} from ${source.label}`}
                      onClick={() => showRecipes(source)}
                      className='h-auto min-h-14 min-w-0 flex-1 items-start justify-start gap-3 px-0! py-2 text-left'
                    >
                      {summary}
                      <ChevronRight
                        className='text-muted-foreground mt-2.5 mr-2.5 h-5 w-5 shrink-0'
                        aria-hidden='true'
                      />
                    </Button>
                  )}
                  {count === 0 && (
                    <span className='mt-2'>
                      <DeleteIconButton
                        label={`Delete ${source.label}`}
                        disabled={deletingId !== null}
                        onClick={() => void handleDelete(source)}
                      />
                    </span>
                  )}
                  <span className='mt-2'>
                    <Button
                      type='button'
                      variant='tertiary'
                      size='icon'
                      aria-label={`Rename ${source.label}`}
                      onClick={() => setEditingId(source.id)}
                      className='size-10 min-w-10 shrink-0 p-0'
                    >
                      <Pencil className='h-4 w-4' aria-hidden='true' />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
      </div>
      {editing && (
        <SourceFormSheet
          key={editing.id}
          uid={uid}
          source={editing}
          onClose={() => setEditingId(null)}
        />
      )}
    </Subview>
  );
}

export default SourcesSubview;
