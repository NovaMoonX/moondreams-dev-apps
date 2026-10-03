import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface PillProps {
  children: ReactNode;
  isSelected: boolean;
  onClick: () => void;
  emoji?: string;
  className?: string;
}

/** A rounded option that is either on or off: a filter, or one choice among a few. */
function Pill({ children, isSelected, onClick, emoji, className }: PillProps) {
  return (
    <Button
      type='button'
      size='sm'
      rounded='full'
      variant={isSelected ? 'primary' : 'secondary'}
      aria-pressed={isSelected}
      onClick={onClick}
      className={join('shrink-0 gap-1.5 whitespace-nowrap', className)}
    >
      {emoji && <span aria-hidden='true'>{emoji}</span>}
      {children}
    </Button>
  );
}

export default Pill;
