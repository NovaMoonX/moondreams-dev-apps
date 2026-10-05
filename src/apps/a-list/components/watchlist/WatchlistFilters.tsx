import { Button } from '@moondreamsdev/dreamer-ui/components';
import { X } from 'lucide-react';

import Pill from '@/components/Pill';
import {
  WATCH_PRIORITY_EMOJIS,
  WATCH_PRIORITY_LABELS,
  WATCHLIST_FILTERS,
} from '@apps/a-list/constants';
import type { WatchlistFilter } from '@apps/a-list/types';

interface WatchlistFiltersProps {
  value: WatchlistFilter[];
  openingCount: number;
  onToggle: (filter: WatchlistFilter) => void;
  onClear: () => void;
}

function getFilterView(filter: WatchlistFilter) {
  if (filter === 'opening') return { emoji: '🎬', label: 'Opening' };
  if (filter === 'seen') return { emoji: '👀', label: 'Seen' };
  return { emoji: WATCH_PRIORITY_EMOJIS[filter], label: WATCH_PRIORITY_LABELS[filter] };
}

/** Pills that narrow the list. They scroll sideways on a phone, so every label stays whole. */
function WatchlistFilters({
  value,
  openingCount,
  onToggle,
  onClear,
}: WatchlistFiltersProps) {
  return (
    <div
      className='-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0'
      role='group'
      aria-label='Filter your watchlist'
    >
      {value.length > 0 && (
        <Button
          type='button'
          size='sm'
          rounded='full'
          variant='outline'
          className='shrink-0 gap-1 whitespace-nowrap'
          onClick={onClear}
        >
          <X className='h-3.5 w-3.5' /> Clear
        </Button>
      )}
      {WATCHLIST_FILTERS.map((filter) => {
        const { emoji, label } = getFilterView(filter);
        return (
          <Pill
            key={filter}
            emoji={emoji}
            isSelected={value.includes(filter)}
            onClick={() => onToggle(filter)}
          >
            {label}
            {filter === 'opening' && openingCount > 0 && (
              <span className='bg-background/30 rounded-full px-1.5 text-[11px] font-semibold'>
                {openingCount}
              </span>
            )}
          </Pill>
        );
      })}
    </div>
  );
}

export default WatchlistFilters;
