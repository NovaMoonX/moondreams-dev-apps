import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface PillProps {
  children: ReactNode;
  isSelected: boolean;
  onClick: () => void;
  emoji?: string;
  /** A small image or icon shown before the label, for an option that has a picture instead of an emoji. */
  icon?: ReactNode;
  /** A filter or view switch: as tall as its text instead of a 40px tap target, with the hit area kept by a pseudo-element. */
  isThin?: boolean;
  /** Shown but can't be chosen, like a sold-out showing. */
  isDisabled?: boolean;
  /** The full phrase when the visible words are a short form of it. */
  ariaLabel?: string;
  className?: string;
}

/** A rounded option that is either on or off: a filter, or one choice among a few. */
function Pill({
  children,
  isSelected,
  onClick,
  emoji,
  icon,
  isThin = false,
  isDisabled = false,
  ariaLabel,
  className,
}: PillProps) {
  return (
    <Button
      type='button'
      size='sm'
      rounded='full'
      variant={isSelected ? 'primary' : 'secondary'}
      aria-pressed={isSelected}
      aria-label={ariaLabel}
      data-pill=''
      disabled={isDisabled}
      onClick={onClick}
      className={join(
        'max-w-full shrink-0 gap-1.5 whitespace-nowrap !transition-none',
        isThin &&
          "relative h-6! min-h-0! px-2.5 py-0! text-xs before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']",
        className,
      )}
    >
      {emoji && (
        <span aria-hidden='true' data-pill-emoji=''>
          {emoji}
        </span>
      )}
      {icon}
      {typeof children === 'string' ? (
        <span className='truncate'>{children}</span>
      ) : (
        children
      )}
    </Button>
  );
}

export default Pill;
