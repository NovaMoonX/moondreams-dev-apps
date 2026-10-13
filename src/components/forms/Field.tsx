import { useId, type ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

/** Put on the input inside a compact `Field`: 40px tall and a smaller placeholder (typed text stays 16px so a phone doesn't zoom on focus). */
export const COMPACT_INPUT_CLASS = 'min-h-10 h-10 placeholder:text-sm';

interface FieldProps {
  label: ReactNode;
  /** A smaller caption and tighter spacing for a grid of short fields (four nutrition numbers). */
  isCompact?: boolean;
  children: (id: string) => ReactNode;
}

/** A visible caption above one control, wrapping it so a screen reader and a tap on the caption both reach it (Dreamer UI's inputs ignore an `id`, so a `for` link would point at nothing). */
function Field({ label, isCompact = false, children }: FieldProps) {
  const id = useId();

  return (
    <label className={join('block', isCompact ? 'space-y-1' : 'space-y-1.5')}>
      <span
        className={join(
          'block font-medium',
          isCompact && 'text-muted-foreground text-xs',
        )}
      >
        {label}
      </span>
      {children(id)}
    </label>
  );
}

export default Field;
