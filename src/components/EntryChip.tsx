import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

interface EntryChipProps {
  icon: ReactNode;
  label: string;
  /** A few words for something there that wants a look ("2 to eat soon"), in a soft tint after the label; only while it applies. */
  note?: string;
  /** The full phrase when the chip shows less than it means; it starts with the visible label. */
  ariaLabel?: string;
  onClick: () => void;
}

/** A way into a related screen as a hairline pill at least 40px tall: icon and label, and a tinted note when something there wants a look. No count: the chip appears only once something is behind it. The icon shows from `sm` up, where the row has room for it. */
function EntryChip({ icon, label, note, ariaLabel, onClick }: EntryChipProps) {
  return (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      rounded='full'
      aria-label={ariaLabel}
      onClick={onClick}
      className='h-auto min-h-10 max-w-full min-w-0 shrink-0 flex-wrap justify-start gap-x-1.5 gap-y-1 px-2.5 py-1.5 text-left text-sm font-medium'
    >
      <span className='inline-flex shrink-0 max-sm:hidden' aria-hidden='true'>
        {icon}
      </span>
      <span className='whitespace-nowrap'>{label}</span>
      {note && (
        <span className='bg-accent text-foreground rounded-full px-2 py-0.5 text-xs font-medium'>
          {note}
        </span>
      )}
    </Button>
  );
}

export default EntryChip;
