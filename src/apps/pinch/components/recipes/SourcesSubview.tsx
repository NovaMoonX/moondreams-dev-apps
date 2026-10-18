import { useMemo, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import IntroCard from '@/components/IntroCard';
import SearchInput from '@/components/SearchInput';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import SourceFormSheet from '@apps/pinch/components/recipes/SourceFormSheet';
import { LIST_SEARCH_THRESHOLD } from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { announceSourceShown } from '@apps/pinch/hooks/useSourceShown';
import {
  selectRecipes,
  selectSourceCounts,
  selectSources,
  selectSourcesById,
} from '@apps/pinch/store/selectors';
import type { Source } from '@apps/pinch/types';
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import { getRecipeSource } from '@apps/pinch/utils/sources';

const TITLES_SHOWN = 2;

const getRecipesLine = (count: number, titles: string[]) => {
  if (count === 0) return 'Not on any recipe';
  const noun = count === 1 ? 'recipe' : 'recipes';
  const rest = count - TITLES_SHOWN;
  const names =
    rest > 0
      ? `${titles.slice(0, TITLES_SHOWN).join(', ')} and ${rest} more`
      : titles.join(', ');
  return `${count} ${noun} · ${names}`;
};

interface SourcesSubviewProps {
  uid: string;
}

/** The sources with their recipe counts: a row opens its source, where its recipes, its name and its delete are. A source is made from a recipe's form, where it is used. */
function SourcesSubview({ uid }: SourcesSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const sources = useAppSelector(selectSources);
  const counts = useAppSelector(selectSourceCounts).bySource;
  const recipes = useAppSelector(selectRecipes);
  const sourcesById = useAppSelector(selectSourcesById);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const shown = useMemo(
    () =>
      searchByName(
        sources.map((source) => ({ name: source.label, source })),
        query,
      ).map(({ source }) => source),
    [sources, query],
  );
  const titlesBySource = useMemo(
    () =>
      recipes.reduce((acc, recipe) => {
        const source = getRecipeSource(recipe, sourcesById);
        return source
          ? acc.set(source.id, [...(acc.get(source.id) ?? []), recipe.title])
          : acc;
      }, new Map<string, string[]>()),
    [recipes, sourcesById],
  );
  const editing = sources.find((source) => source.id === editingId) ?? null;

  const showRecipes = (source: Source) => {
    announceSourceShown(source.id);
    closeSubview();
  };
  const closeSheet = () => {
    setEditingId(null);
    window.requestAnimationFrame(() => {
      if (openerRef.current?.isConnected) openerRef.current.focus();
    });
  };

  return (
    <Subview title='Sources' onClose={closeSubview}>
      <div className='space-y-4'>
        {sources.length > 0 && sources.length < LIST_SEARCH_THRESHOLD && (
          <IntroCard icon='📚' lead='Where your recipes come from.'>
            Rename one and every recipe from it follows.
          </IntroCard>
        )}
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
          <ul className='border-border divide-border divide-y rounded-2xl border px-3'>
            {shown.map((source) => (
              <li key={source.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  aria-haspopup='dialog'
                  onClick={(event) => {
                    openerRef.current = event.currentTarget;
                    setEditingId(source.id);
                  }}
                  className='h-auto min-h-14 w-full items-start justify-start gap-3 px-0! py-2 text-left'
                >
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
                    <span className='text-muted-foreground block truncate text-xs font-normal'>
                      {getRecipesLine(
                        counts.get(source.id) ?? 0,
                        titlesBySource.get(source.id) ?? [],
                      )}
                    </span>
                  </span>
                  <ChevronRight
                    className='text-muted-foreground mt-2.5 mr-2.5 h-5 w-5 shrink-0'
                    aria-hidden='true'
                  />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && (
        <SourceFormSheet
          key={editing.id}
          uid={uid}
          source={editing}
          onShowRecipes={() => showRecipes(editing)}
          onClose={closeSheet}
        />
      )}
    </Subview>
  );
}

export default SourcesSubview;
