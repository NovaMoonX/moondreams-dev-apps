import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

interface LabelChipProps {
  /** Truncates with an ellipsis before it widens the chip's container. */
  children: string;
  onClick: () => void;
  /** The full phrase when the chip's own label says less than the tap does; it starts with the visible label. */
  ariaLabel?: string;
  /** After the label: a ✕ for a chip that clears something, a chevron for one that opens something. */
  icon?: ReactNode;
}

/** A small soft-tinted tag that is also a button: as tall as its text, with a 40px hit area from a pseudo-element, so it labels a thing without out-weighing what is beside it. */
function LabelChip({ children, onClick, ariaLabel, icon }: LabelChipProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      rounded='full'
      aria-label={ariaLabel}
      className="bg-accent text-accent-foreground! relative h-6! min-h-0! max-w-full gap-1 px-2.5 py-0! text-xs font-normal before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
      onClick={onClick}
    >
      <span className='truncate'>{children}</span>
      {icon}
    </Button>
  );
}

export default LabelChip;
