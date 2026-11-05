import { ChevronRight, TriangleAlert } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { keepEntryFor } from '@/hooks/useBackHistory';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

interface MoveWarningRowProps {
  /** "Move $1,240 to Capital One B". */
  sentence: string;
  /** "By Nov 12th · for Discover, Citi and Phone". */
  note: string;
  /** The confirmed day whose checklist holds the move. */
  dayKey: string;
}

/** Money still to move after an income day, as a row of "Things to fix" that opens that day's checklist. */
function MoveWarningRow({ sentence, note, dayKey }: MoveWarningRowProps) {
  const { openDay } = useRunwayUrlState();
  return (
    <Button
      type='button'
      variant='tertiary'
      className='text-foreground! h-auto min-h-14 w-full items-start justify-start gap-3 rounded-none p-3! text-left font-normal whitespace-normal'
      aria-label={`${sentence}. ${note}`}
      onClick={() => {
        keepEntryFor('fixes');
        openDay(dayKey);
      }}
    >
      <span
        className='grid size-9 shrink-0 place-items-center rounded-full bg-(--runway-warning-soft) text-(--runway-warning-ink) shadow-[inset_0_0_0_1px_var(--runway-warning-edge)]'
        aria-hidden='true'
      >
        <TriangleAlert className='h-4 w-4' />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block font-medium break-words'>{sentence}</span>
        <span className='text-muted-foreground block text-sm'>{note}</span>
      </span>
      <ChevronRight
        className='text-muted-foreground mt-2.5 h-4 w-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default MoveWarningRow;
