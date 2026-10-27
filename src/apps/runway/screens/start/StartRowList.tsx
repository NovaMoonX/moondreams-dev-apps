import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import ShowMoreButton from '@/components/ShowMoreButton';
import ItemBadge from '@apps/runway/components/ItemBadge';
import type { StartRow } from '@apps/runway/screens/start/startRows';

const SEARCH_FROM = 8;

interface StartRowListProps {
  rows: StartRow[];
  /** What the search box is called, "Search your bills". */
  searchLabel: string;
  onOpen: (id: string) => void;
}

/** What has been added in a step: one-line rows that each open their item, searchable from eight and folded after a few. */
function StartRowList({ rows, searchLabel, onOpen }: StartRowListProps) {
  const [query, setQuery] = useState('');
  const [isAll, setIsAll] = useState(false);
  const text = query.trim().toLowerCase();
  const matches =
    text === ''
      ? rows
      : rows.filter((row) => row.name.toLowerCase().includes(text));
  const shown = isAll || text !== '' ? matches : matches.slice(0, SEARCH_FROM);

  if (rows.length === 0) return null;
  return (
    <div className='space-y-2'>
      {rows.length >= SEARCH_FROM && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={searchLabel}
        />
      )}
      <ul className='border-border bg-card divide-border divide-y overflow-hidden rounded-2xl border'>
        {shown.map((row) => (
          <li key={row.id}>
            <Button
              type='button'
              variant='tertiary'
              className='text-foreground! h-auto min-h-14 w-full justify-start gap-3 rounded-none px-3 py-2 text-left font-normal'
              aria-label={`${row.name}${row.amount ? `, ${row.amount}` : ''}, ${row.line}`}
              onClick={() => onOpen(row.id)}
            >
              <ItemBadge name={row.name} emoji={row.emoji} />
              <span className='min-w-24 flex-1'>
                <span className='line-clamp-2 block text-base font-medium break-words'>
                  {row.name}
                </span>
                <span className='text-muted-foreground line-clamp-2 block text-sm break-words'>
                  {row.line}
                </span>
              </span>
              {row.amount && (
                <span className='max-w-[40%] min-w-0 shrink text-right text-base font-semibold break-words tabular-nums'>
                  {row.amount}
                </span>
              )}
              <ChevronRight
                className='text-muted-foreground h-5 w-5 shrink-0'
                aria-hidden='true'
              />
            </Button>
          </li>
        ))}
      </ul>
      {text !== '' && matches.length === 0 && (
        <p className='text-muted-foreground text-sm'>Nothing matches that.</p>
      )}
      {text === '' && rows.length > SEARCH_FROM && (
        <ShowMoreButton
          isOpen={isAll}
          onClick={() => setIsAll((open) => !open)}
        >
          {isAll ? 'Show fewer' : `Show all ${rows.length}`}
        </ShowMoreButton>
      )}
    </div>
  );
}

export default StartRowList;
