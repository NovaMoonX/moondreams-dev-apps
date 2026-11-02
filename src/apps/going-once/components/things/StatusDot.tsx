import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import { STATUS_LABELS } from '@apps/going-once/constants';
import type { ItemStatus } from '@apps/going-once/types';

const DOT_COLORS: Record<ItemStatus, string> = {
  AVAILABLE: 'bg-(--going-once-available)',
  PENDING: 'bg-(--going-once-pending)',
  SOLD: 'bg-(--going-once-sold)',
  WITHDRAWN: 'bg-(--going-once-withdrawn)',
};

interface StatusDotProps {
  status: ItemStatus;
  /** What follows the word ("for Nate · pickup Sat, Nov 7"). */
  children?: ReactNode;
  /** Only the dot, for a row's muted line; the word stays for screen readers. */
  isWordHidden?: boolean;
  className?: string;
}

/** A status as an 8px dot and its word, in the sale's status colours. */
function StatusDot({
  status,
  children,
  isWordHidden = false,
  className,
}: StatusDotProps) {
  return (
    <span
      className={join(
        'inline-flex min-w-0 items-baseline gap-1.5 text-[13px]',
        className,
      )}
    >
      <span
        className={join(
          'size-2 shrink-0 translate-y-px self-center rounded-full',
          DOT_COLORS[status],
        )}
        aria-hidden='true'
      />
      <span className={join('min-w-0 break-words', isWordHidden && 'sr-only')}>
        {STATUS_LABELS[status]}
        {children !== undefined && children !== '' && ` ${children}`}
      </span>
    </span>
  );
}

export default StatusDot;
