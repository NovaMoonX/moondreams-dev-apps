import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface PillProps {
  children: ReactNode;
  isSelected: boolean;
  onClick: () => void;
  emoji?: string;
  /** A filter or view switch: as tall as its text instead of a 40px tap target, with the hit area kept by a pseudo-element. */
  isThin?: boolean;
  className?: string;
}

/** A rounded option that is either on or off: a filter, or one choice among a few. */
function Pill({ children, isSelected, onClick, emoji, isThin = false, className }: PillProps) {
  return (
    <Button
      type='button'
      size='sm'
      rounded='full'
      variant={isSelected ? 'primary' : 'secondary'}
      aria-pressed={isSelected}
      data-pill=''
      onClick={onClick}
      className={join(
        'max-w-full shrink-0 gap-1.5 whitespace-nowrap !transition-none',
        isThin && "relative h-6! min-h-0! px-2.5 py-0! text-xs before:absolute before:-inset-y-2 before:inset-x-0 before:content-['']",
        className,
      )}
    >
      {emoji && <span aria-hidden='true'>{emoji}</span>}
      {typeof children === 'string' ? (
        <span className='truncate'>{children}</span>
      ) : (
        children
      )}
    </Button>
  );
}

export default Pill;
