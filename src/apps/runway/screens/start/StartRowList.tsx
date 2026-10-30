import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import ShowMoreButton from '@/components/ShowMoreButton';
import { RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import ItemBadge from '@apps/runway/components/ItemBadge';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { useItemEmoji } from '@apps/runway/hooks/useItemEmoji';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import type { StartRow } from '@apps/runway/screens/start/startRows';

const ROWS_SHOWN = 8;

interface StartRowListProps {
  rows: StartRow[];
  /** What the search box is called, "Search your bills". */
  searchLabel: string;
  onOpen: (id: string) => void;
}

function StartRowBadge({ row }: { row: StartRow }) {
  const emoji = useItemEmoji(row.emoji, row.groupId ?? null);
  return <ItemBadge name={row.name} emoji={emoji} />;
}

/** What has been added in a step: one-line rows that each open their item, searchable from eight and folded after a few. */
function StartRowList({ rows, searchLabel, onOpen }: StartRowListProps) {
  const mask = useMaskedText();
  const [query, setQuery] = useState('');
  const [isAll, setIsAll] = useState(false);
  const text = query.trim().toLowerCase();
  const matches =
    text === ''
      ? rows
      : rows.filter((row) => row.name.toLowerCase().includes(text));
  const shown = isAll || text !== '' ? matches : matches.slice(0, ROWS_SHOWN);

  if (rows.length === 0) return null;
  return (
    <div className='space-y-2'>
      {rows.length >= RUNWAY_SEARCH_THRESHOLD && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={searchLabel}
        />
      )}
      <ul className='border-border bg-card divide-border divide-y overflow-hidden rounded-2xl border'>
        {shown.map((row, index) => (
          <li key={row.id}>
            {row.group !== undefined &&
              row.group !== shown[index - 1]?.group && (
                <p className='bg-muted/50 text-muted-foreground px-3 py-1.5 text-sm font-medium'>
                  {row.group}
                </p>
              )}
            <Button
              type='button'
              variant='tertiary'
              className='text-foreground! h-auto min-h-14 w-full justify-start gap-3 rounded-none px-3 py-2 text-left font-normal'
              aria-label={mask(
                `${row.name}${row.amount ? `, ${row.amount}` : ''}, ${row.line}`,
              )}
              onClick={() => onOpen(row.id)}
            >
              <StartRowBadge row={row} />
              <span className='min-w-24 flex-1'>
                <span className='line-clamp-2 block text-base font-medium break-words'>
                  {row.name}
                </span>
                <span className='text-muted-foreground line-clamp-2 block text-sm break-words'>
                  <MaskedText>{row.line}</MaskedText>
                </span>
              </span>
              {row.amount && (
                <span
                  className={join(
                    'text-right tabular-nums',
                    row.isAmountMuted
                      ? 'text-muted-foreground max-w-[40%] min-w-0 shrink text-sm'
                      : 'shrink-0 text-base font-semibold whitespace-nowrap',
                  )}
                >
                  <MaskedText>{row.amount}</MaskedText>
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
      {text === '' && rows.length > ROWS_SHOWN && (
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
