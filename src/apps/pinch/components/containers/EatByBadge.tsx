import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { EatByState } from '@apps/pinch/utils/containers';

interface EatByBadgeProps {
  state: EatByState;
  /** The date or state in words ("Eat by tomorrow", "Past its date"), the row's one eat-by item. */
  label: string;
}

function EatByBadge({ state, label }: EatByBadgeProps) {
  if (state === 'LATER') {
    return null;
  }

  return (
    <span
      className={join(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        state === 'SOON'
          ? 'text-foreground bg-[var(--pinch-drizzle-soft)] ring-1 ring-[var(--pinch-drizzle)]/40 ring-inset'
          : 'text-foreground bg-destructive/10 ring-destructive/30 ring-1 ring-inset',
      )}
    >
      {label}
    </span>
  );
}

export default EatByBadge;
