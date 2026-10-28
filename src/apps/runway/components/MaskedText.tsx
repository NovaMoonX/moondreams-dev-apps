import type { ReactNode } from 'react';

import SensitiveValue from '@/components/SensitiveValue';
import { FIGURE } from '@apps/runway/utils/maskText';

interface MaskedTextProps {
  children: string;
}

/** A line with each amount in it masked while amounts are hidden and the words left readable. */
export function MaskedText({ children }: MaskedTextProps): ReactNode {
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
