import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

interface RevealChipProps {
  children: ReactNode;
  onClick: () => void;
  /** Before the label: a "+" for a field that appears, an ✕ for taking it away. */
  icon?: ReactNode;
}

/** A dashed chip that opens an optional extra of a form or switches a field's mode, so it never reads as a link. */
function RevealChip({ children, onClick, icon }: RevealChipProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      rounded='full'
      className='border-border text-foreground! h-10 gap-1.5 border border-dashed px-3 font-normal'
      onClick={onClick}
    >
      {icon}
      {children}
    </Button>
  );
}

export default RevealChip;
