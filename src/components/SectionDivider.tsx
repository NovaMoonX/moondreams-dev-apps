import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

interface SectionDividerProps {
  label: string;
  /** Sits beside the label, inside the lines (a count, a weather chip). */
  trailing?: ReactNode;
  className?: string;
}

/** A hairline with a centered label, for breaking a list or a long form into named sections. */
function SectionDivider({ label, trailing, className }: SectionDividerProps) {
  return (
    <div className={join('flex items-center gap-3', className)}>
      <div className='border-border flex-1 border-t' />
      <span className='text-muted-foreground text-sm font-medium'>{label}</span>
      {trailing}
      <div className='border-border flex-1 border-t' />
    </div>
  );
}

export default SectionDivider;
