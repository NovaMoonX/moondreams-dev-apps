import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { EatByState } from '@apps/pinch/utils/containers';

interface EatByBadgeProps {
  state: EatByState;
}

/** A soft tint and a plain word, never a solid fill: "Eat soon" for today and the next two days, "Past its date" after. */
function EatByBadge({ state }: EatByBadgeProps) {
  if (state === 'LATER') {
    return null;
  }

  return (
    <span
      className={join(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        state === 'SOON'
          ? 'text-foreground bg-[var(--pinch-drizzle-soft)]'
          : 'text-foreground bg-destructive/10 ring-destructive/30 ring-1 ring-inset',
      )}
    >
      {state === 'SOON' ? 'Eat soon' : 'Past its date'}
    </span>
  );
}

export default EatByBadge;
