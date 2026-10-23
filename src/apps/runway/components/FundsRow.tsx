import { ChevronRight } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { DRAFT_WORDS } from '@apps/runway/constants';

const MAX_SHOWN_NAMES = 3;

interface FundsRowProps {
  /** Names of what the money funds, in order. */
  names: string[];
  onOpen: () => void;
  ariaLabel: string;
}

/** What a source, pay line or day sends its money to, as a row that opens the pairings. */
function FundsRow({ names, onOpen, ariaLabel }: FundsRowProps) {
  const shown = names.slice(0, MAX_SHOWN_NAMES).join(', ');
  const more = names.length - MAX_SHOWN_NAMES;
  const summary =
    names.length === 0
      ? DRAFT_WORDS.fundsNone
      : more > 0
        ? `${shown} and ${more} more`
        : shown;

  return (
    <Button
      type='button'
      variant='tertiary'
      className='h-auto min-h-11 w-full items-start justify-between gap-3 px-0! py-2 text-left font-normal whitespace-normal'
      aria-label={ariaLabel}
      onClick={onOpen}
    >
      <span className='min-w-0 flex-1'>
        <span className='text-muted-foreground block text-xs'>
          {DRAFT_WORDS.fundsHeading}
        </span>
        <span className='block break-words'>{summary}</span>
      </span>
      <ChevronRight
        className='text-muted-foreground mt-3 h-4 w-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default FundsRow;
