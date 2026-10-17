import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

interface LabelChipProps {
  /** Truncates with an ellipsis before it widens the chip's container. */
  children: string;
  /** Without it the chip is a plain label: not a button, no hit area. */
  onClick?: () => void;
  /** The full phrase when the chip's own label says less than the tap does; it starts with the visible label. */
  ariaLabel?: string;
  /** After the label: a ✕ for a chip that clears something, a chevron for one that opens something. */
  icon?: ReactNode;
  /** About how many characters at the end of a label too long to fit stay visible: the cut falls in the middle, not at the end. */
  keepEnd?: number;
}

const splitForMiddleCut = (text: string, keepEnd: number) => {
  if (keepEnd <= 0 || text.length <= keepEnd * 2) {
    return { head: text, tail: '' };
  }
  const tailStart = text.indexOf(' ', text.length - keepEnd);
  if (tailStart === -1) {
    return { head: text, tail: '' };
  }

  return { head: text.slice(0, tailStart), tail: text.slice(tailStart) };
};

/** A small soft-tinted tag, as tall as its text, so it labels a thing without out-weighing what is beside it. Given an `onClick` it is a button with a 40px hit area from a pseudo-element. */
function LabelChip({
  children,
  onClick,
  ariaLabel,
  icon,
  keepEnd = 0,
}: LabelChipProps) {
  const { head, tail } = splitForMiddleCut(children, keepEnd);
  const label = (
    <>
      <span className='truncate'>{head}</span>
      {tail && <span className='shrink-0 whitespace-pre'>{tail}</span>}
      {icon}
    </>
  );

  if (!onClick) {
    return (
      <span className='bg-accent text-accent-foreground inline-flex h-6 max-w-full items-center justify-center gap-1 rounded-full px-2.5 text-xs'>
        {label}
      </span>
    );
  }

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
      <span className='inline-flex max-w-full min-w-0 items-center gap-1'>
        {label}
      </span>
    </Button>
  );
}

export default LabelChip;
