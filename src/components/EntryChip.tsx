import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

interface EntryChipProps {
  icon: ReactNode;
  label: string;
  /** Shown muted after the label, only above zero. */
  count?: number;
  /** A small mark after the count (a dot for something that wants a look); say what it means in `ariaLabel`. */
  trailing?: ReactNode;
  /** The full phrase when the chip shows less than it means ("Prepared meals, 9 containers, 2 to eat soon"). */
  ariaLabel?: string;
  onClick: () => void;
}

/** A way into a related screen as a 40px hairline pill: icon, label, muted count. Chips sit in one wrapping row under a list's search; the icon shows from `sm` up, where the row has room for it. */
function EntryChip({
  icon,
  label,
  count = 0,
  trailing,
  ariaLabel,
  onClick,
}: EntryChipProps) {
  return (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      rounded='full'
      aria-label={ariaLabel}
      onClick={onClick}
      className='h-10 max-w-full min-w-0 shrink-0 gap-1.5 px-3 text-sm font-medium whitespace-nowrap'
    >
      <span className='inline-flex shrink-0 max-sm:hidden' aria-hidden='true'>
        {icon}
      </span>
      <span className='truncate'>{label}</span>
      {count > 0 && (
        <span className='text-muted-foreground font-normal'>{count}</span>
      )}
      {trailing}
    </Button>
  );
}

export default EntryChip;
