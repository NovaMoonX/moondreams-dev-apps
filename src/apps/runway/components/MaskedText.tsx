import type { ReactNode } from 'react';

import SensitiveValue from '@/components/SensitiveValue';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { FIGURE } from '@apps/runway/utils/maskText';

interface MaskedTextProps {
  children: string;
}

/** A line with each amount in it masked while amounts are hidden and the words left readable. */
export function MaskedText({ children }: MaskedTextProps): ReactNode {
  const { isHidden } = useValuesHidden();
  if (!isHidden) return children;

  return children
    .split(FIGURE)
    .map((part, index) =>
      index % 2 === 1 ? (
        <SensitiveValue key={index}>{part}</SensitiveValue>
      ) : (
        part
      ),
    );
}
