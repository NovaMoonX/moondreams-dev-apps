import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown } from 'lucide-react';

interface FoldedLineProps {
  text: string;
  isOpen: boolean;
  label: string;
  onToggle: () => void;
}

/** The day card put away: one line that opens the card again, and folds it once open. */
function FoldedLine({ text, isOpen, label, onToggle }: FoldedLineProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      aria-expanded={isOpen}
      aria-label={label}
      className='flex h-auto min-h-11 w-full items-center justify-between gap-3 px-0! text-left text-[15px] font-normal'
      onClick={onToggle}
    >
      <span className='min-w-0 flex-1 text-pretty'>{text}</span>
      <ChevronDown
        className={join(
          'text-muted-foreground size-4 shrink-0',
          isOpen && 'rotate-180',
        )}
        aria-hidden='true'
      />
    </Button>
  );
}

export default FoldedLine;
