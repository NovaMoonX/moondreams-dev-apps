import { ChevronRight, TriangleAlert } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { CARD_WORDS } from '@apps/runway/constants';

interface DueCardRowProps {
  /** The sentence that says which card is due and what waits on it. */
  sentence: string;
  onOpen: () => void;
}

/** A card that is coming due, as a row of "Things to fix" that opens its Pay off. */
function DueCardRow({ sentence, onOpen }: DueCardRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='text-foreground! h-auto min-h-14 w-full items-start justify-start gap-3 rounded-none p-3! text-left font-normal whitespace-normal'
      aria-label={`${sentence}. ${CARD_WORDS.dueWarningOpen}`}
      onClick={onOpen}
    >
      <span
        className='grid size-9 shrink-0 place-items-center rounded-full bg-(--runway-warning-soft) text-(--runway-warning-ink) shadow-[inset_0_0_0_1px_var(--runway-warning-edge)]'
        aria-hidden='true'
      >
        <TriangleAlert className='h-4 w-4' />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block font-medium break-words'>{sentence}</span>
        <span className='text-muted-foreground block text-sm'>
          {CARD_WORDS.dueWarningOpen}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground mt-2.5 h-4 w-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default DueCardRow;
