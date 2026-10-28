import { join } from '@moondreamsdev/dreamer-ui/utils';

import { PRIORITY_LABELS } from '@apps/runway/constants';
import type { Priority } from '@apps/runway/types';

interface PriorityBadgeProps {
  priority: Priority;
}

/** Must, Should or Want as a soft tint; the word carries the meaning, the tint only ranks it. */
function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={join(
        'inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap',
        priority === 'must' &&
          'border-primary/40 bg-primary/15 text-foreground',
        priority === 'should' && 'border-border bg-accent text-foreground',
        priority === 'want' &&
          'border-border bg-muted/50 text-muted-foreground',
      )}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export default PriorityBadge;
