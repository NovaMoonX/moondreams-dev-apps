import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useValuesHidden } from '@/hooks/useValuesHidden';

export const MASK = '••••';

interface SensitiveValueProps {
  children: ReactNode;
  className?: string;
}

/** Wraps a figure or a short line that is private until the person shows it: while hidden it is replaced by one fixed mask in the neutral colour. */
function SensitiveValue({ children, className }: SensitiveValueProps) {
  const { isHidden } = useValuesHidden();

  if (isHidden) {
    // A blur keeps the figure's width, sign and colour, which give away its size and whether it is negative.
    return (
      <span
        className={join(
          'text-muted-foreground! inline-block tracking-widest select-none',
          className,
        )}
        role='img'
        aria-label='Hidden amount'
      >
        {MASK}
      </span>
    );
  }

  return <span className={join('select-text', className)}>{children}</span>;
}

export default SensitiveValue;
