import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Plus } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import SourceFormSheet from '@apps/pinch/components/recipes/SourceFormSheet';
import { LIST_SEARCH_THRESHOLD } from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { selectSourceCounts, selectSources } from '@apps/pinch/store/selectors';
import { searchByName } from '@apps/pinch/utils/catalogSearch';

type FormState = { sourceId: string | null };

interface SourcesSubviewProps {
  uid: string;
}

function SourcesSubview({ uid }: SourcesSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const sources = useAppSelector(selectSources);
  const counts = useAppSelector(selectSourceCounts).bySource;
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormState | null>(null);

  const shown = useMemo(
    () =>
      searchByName(
        sources.map((source) => ({ name: source.label, source })),
        query,
      ).map(({ source }) => source),
    [sources, query],
  );
  const editing = form?.sourceId
    ? (sources.find((source) => source.id === form.sourceId) ?? null)
    : null;

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
          action={
            <Button
              type='button'
              size='sm'
              rounded='full'
              className='gap-1'
              onClick={() => setForm({ sourceId: null })}
            >
              <Plus className='h-4 w-4' aria-hidden='true' />
              New source
            </Button>
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
            Add where your recipes come from, a favorite site or a stack of
            cookbooks, and you can find them by it.
          </p>
        ) : shown.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
            Nothing matches “{query.trim()}”.
          </p>
        ) : (
          <ul className='divide-border divide-y'>
            {shown.map((source) => {
              const count = counts.get(source.id) ?? 0;
              return (
                <li key={source.id}>
                  <Button
                    type='button'
                    variant='tertiary'
                    onClick={() => setForm({ sourceId: source.id })}
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
                      {count > 0 && (
                        <span className='text-muted-foreground block text-xs font-normal'>
                          {count} {count === 1 ? 'recipe' : 'recipes'}
                        </span>
                      )}
                    </span>
                    <ChevronRight
                      className='text-muted-foreground mt-2.5 h-5 w-5 shrink-0'
                      aria-hidden='true'
                    />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {form && (form.sourceId === null || editing) && (
        <SourceFormSheet
          key={form.sourceId ?? 'new'}
          uid={uid}
          source={editing}
          onClose={() => setForm(null)}
        />
      )}
    </Subview>
  );
}

export default SourcesSubview;
