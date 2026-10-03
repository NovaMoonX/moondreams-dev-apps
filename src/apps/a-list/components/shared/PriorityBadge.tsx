import { Badge } from '@moondreamsdev/dreamer-ui/components';

import { WATCH_PRIORITY_LABELS } from '@apps/a-list/constants';
import type { WatchPriority } from '@apps/a-list/types';

const PRIORITY_VARIANTS = {
  MUST_SEE: 'primary',
  WANT_TO_SEE: 'secondary',
  IF_I_HAVE_TIME: 'muted',
} as const;

interface PriorityBadgeProps {
  priority: WatchPriority;
}

function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <Badge variant={PRIORITY_VARIANTS[priority]} size='xs'>
      {WATCH_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export default PriorityBadge;
