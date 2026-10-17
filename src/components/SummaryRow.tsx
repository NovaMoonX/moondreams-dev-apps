import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

interface SummaryRowProps {
  /** A small caption above the value. */
  label: string;
  /** What the field holds. */
  children: ReactNode;
  /** A muted line under the value. */
  detail?: ReactNode;
  /** The full phrase for screen readers, when the row's text alone doesn't say what a tap does. */
  ariaLabel?: string;
  /** Without one the row only states its value: no chevron, nothing to tap. */
  onClick?: () => void;
}

/** A value the person can change, as a caption, the value and a chevron, for a sheet that swaps its own content to change it. `SummaryEditor` is the same row where an editor opens beside it. */
function SummaryRow({
  label,
  children,
  detail,
  ariaLabel,
  onClick,
}: SummaryRowProps) {
  const body = (
    <span className='min-w-0 flex-1'>
      <span className='text-muted-foreground block text-xs font-normal'>
        {label}
      </span>
      <span className='block text-base font-normal break-words'>
        {children}
      </span>
      {detail && (
        <span className='text-muted-foreground block text-sm font-normal'>
          {detail}
        </span>
      )}
    </span>
  );

  if (onClick === undefined) {
    return <div className='min-h-11 py-2 text-left'>{body}</div>;
  }

  return (
    <Button
      type='button'
      variant='tertiary'
      aria-label={ariaLabel}
      onClick={onClick}
      className='h-auto min-h-11 w-full items-start justify-start gap-3 px-0! py-2 text-left'
    >
      {body}
      <ChevronRight
        className='text-muted-foreground mt-2.5 h-5 w-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default SummaryRow;
