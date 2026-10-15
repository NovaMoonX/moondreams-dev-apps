import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

interface IconBadgeProps {
  icon: ReactNode;
  count: number;
  urgent?: boolean;
  className?: string;
}

/** An icon with a small counter pinned to its top-right corner — e.g. an unread/notification count. */
function IconBadge({ icon, count, urgent = false, className }: IconBadgeProps) {
  return (
    <span className={join('relative inline-flex', className)}>
      {icon}
      {count > 0 && (
        <span
          className={join(
            'absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold',
            urgent ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
    </span>
  );
}

export default IconBadge;
