import { Button } from '@moondreamsdev/dreamer-ui/components';
import { BedDouble, ChevronRight } from 'lucide-react';

import { useAppSelector } from '@/store';

import { selectStays } from '@apps/waypoint/store/selectors';

interface StaysEntryProps {
  onOpen: () => void;
}

function StaysEntry({ onOpen }: StaysEntryProps) {
  const stays = useAppSelector(selectStays);
  const [firstStay] = stays;

  const title = firstStay
    ? `${firstStay.name}${stays.length > 1 ? ` + ${stays.length - 1} more` : ''}`
    : 'Add your stays';
  const summary = firstStay
    ? `${stays.length} ${stays.length === 1 ? 'stay' : 'stays'}`
    : 'Share where the group is staying — hotels, rentals, campgrounds — so everyone has the details in one place.';

  return (
    <section className='space-y-1'>
      <h3 className='text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase'>
        Stays
      </h3>
      <Button
        type='button'
        variant='tertiary'
        onClick={onOpen}
        className='border-border h-auto w-full justify-start gap-3 rounded-xl border px-3 py-3 text-left'
      >
        <BedDouble className='text-muted-foreground h-5 w-5 shrink-0' />
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-sm font-medium'>{title}</span>
          <span className='text-muted-foreground block text-xs'>{summary}</span>
        </span>
        <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
      </Button>
    </section>
  );
}

export default StaysEntry;
