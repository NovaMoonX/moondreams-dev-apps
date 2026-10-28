import { ChevronRight, TriangleAlert } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useValuesHidden } from '@/hooks/useValuesHidden';
import { NEEDS_LOOK_WORDS } from '@apps/runway/constants';

/** While amounts are hidden, what stands in for every warning about the plan: it says only that something needs a look, and a tap shows amounts so the warning itself can be read. */
function NeedsALookRow() {
  const { toggle } = useValuesHidden();
  return (
    <Button
      type='button'
      variant='tertiary'
      className='text-foreground! h-auto min-h-11 w-full items-center justify-start gap-3 rounded-2xl border border-(--runway-warning-edge) bg-(--runway-warning-soft) px-3! py-1.5 text-left font-normal whitespace-normal'
      aria-label={`${NEEDS_LOOK_WORDS.title}. ${NEEDS_LOOK_WORDS.door}`}
      onClick={toggle}
    >
      <span
        className='grid size-8 shrink-0 place-items-center rounded-full bg-(--runway-warning-edge)/40 text-(--runway-warning-ink)'
        aria-hidden='true'
      >
        <TriangleAlert className='h-4 w-4' />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block text-sm font-medium'>
          {NEEDS_LOOK_WORDS.title}
        </span>
        <span className='text-muted-foreground block text-[13px]'>
          {NEEDS_LOOK_WORDS.door}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground h-4 w-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default NeedsALookRow;
