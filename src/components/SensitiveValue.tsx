import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useValuesHidden } from '@/hooks/useValuesHidden';

interface SensitiveValueProps {
  children: ReactNode;
  className?: string;
}

/** Wraps a figure or a short line that is private until the person shows it: blurred while hidden, at the same width so nothing reflows. */
function SensitiveValue({ children, className }: SensitiveValueProps) {
  const { isHidden } = useValuesHidden();

  return (
    <span
      className={join(
        'inline-block max-w-full transition-none select-none',
        !isHidden && 'select-text',
        isHidden && 'pointer-events-none blur-[9px]',
        className,
      )}
      aria-label={isHidden ? 'Hidden amount' : undefined}
      role={isHidden ? 'img' : undefined}
    >
      <span aria-hidden={isHidden ? true : undefined}>{children}</span>
    </span>
  );
}

export default SensitiveValue;
