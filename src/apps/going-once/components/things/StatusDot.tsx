import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import {
  DID_NOT_SELL_LABEL,
  NOT_LISTED_LABEL,
  STATUS_LABELS,
} from '@apps/going-once/constants';
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
  /** Replaces the status word where the thing is in a state the status doesn't name ("Draft", "Didn't sell"). */
  label?: string;
  /** Flows with the text around it so a parent's `line-clamp` can clip it; the default is its own flex line. */
  isInline?: boolean;
  className?: string;
}

/** A status as an 8px dot and its word, in the sale's status colours. */
function StatusDot({
  status,
  children,
  label,
  isInline = false,
  className,
}: StatusDotProps) {
  const dotStatus =
    label === NOT_LISTED_LABEL || label === DID_NOT_SELL_LABEL
      ? 'WITHDRAWN'
      : status;
  const dot = (
    <span
      className={join(
        'size-2 shrink-0 rounded-full',
        isInline
          ? 'mr-1.5 inline-block align-middle'
          : 'translate-y-px self-center',
        DOT_COLORS[dotStatus],
      )}
      aria-hidden='true'
    />
  );
  const text = `${label ?? STATUS_LABELS[status]}${
    children !== undefined && children !== '' ? ` ${children}` : ''
  }`;

  if (isInline)
    return (
      <span className={className}>
        {dot}
        {text}
      </span>
    );
  return (
    <span
      className={join(
        'inline-flex min-w-0 items-baseline gap-1.5 text-[13px]',
        className,
      )}
    >
      {dot}
      <span className='min-w-0 break-words'>{text}</span>
    </span>
  );
}

export default StatusDot;
