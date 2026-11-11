import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronDown, ChevronUp } from 'lucide-react';

import LazyMount from '@/components/LazyMount';
import SectionDivider from '@/components/SectionDivider';
import SearchRow from '@apps/helm/components/search/SearchRow';
import { HELM_COPY } from '@apps/helm/constants';
import {
  SEARCH_EXPANDED_MAX,
  SEARCH_PREVIEW,
  toGroupRows,
  type SearchEntry,
  type SearchWhen,
} from '@apps/helm/utils/searchRecords';

interface SearchGroupProps {
  label: string;
  entries: SearchEntry[];
  isExpanded: boolean;
  onToggle: () => void;
  when: SearchWhen;
  onOpen: (entry: SearchEntry) => void;
}

const ROW_HEIGHT = 56;

/** One kind of result under its heading: three rows, then "Show all N" that opens the rest. */
function SearchGroup({
  label,
  entries,
  isExpanded,
  onToggle,
  when,
  onOpen,
}: SearchGroupProps) {
  const { rows, hidden } = toGroupRows(entries, isExpanded);
  const list = (
    <ul className='helm-card divide-border divide-y overflow-hidden'>
      {rows.map((entry) => (
        <li key={entry.id}>
          <SearchRow entry={entry} when={when} onOpen={onOpen} />
        </li>
      ))}
      {entries.length > SEARCH_PREVIEW && (
        <li>
          <Button
            type='button'
            variant='tertiary'
            aria-expanded={isExpanded}
            className='text-muted-foreground! flex h-11 w-full items-center justify-between rounded-none border-0 px-4 text-sm font-normal focus-visible:-outline-offset-2'
            onClick={onToggle}
          >
            {isExpanded
              ? HELM_COPY.searchShowFewer
              : HELM_COPY.searchShowAll(entries.length)}
            {isExpanded ? (
              <ChevronUp className='size-4 shrink-0' aria-hidden='true' />
            ) : (
              <ChevronDown className='size-4 shrink-0' aria-hidden='true' />
            )}
          </Button>
        </li>
      )}
    </ul>
  );

  return (
    <section className='space-y-3'>
      <SectionDivider
        label={label}
        trailing={
          isExpanded ? (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className='text-muted-foreground! relative h-7 px-2 text-[13px] font-normal after:absolute after:-inset-1.5 after:content-[""]'
              onClick={onToggle}
            >
              {HELM_COPY.searchShowFewer}
            </Button>
          ) : null
        }
      />
      {isExpanded ? (
        <LazyMount estimatedHeight={rows.length * ROW_HEIGHT}>{list}</LazyMount>
      ) : (
        list
      )}
      {isExpanded && hidden > 0 && (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.searchFirstShown(SEARCH_EXPANDED_MAX)}
        </p>
      )}
    </section>
  );
}

export default SearchGroup;
