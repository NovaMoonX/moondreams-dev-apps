import { useId, type ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

interface ActionGroupProps {
  children: ReactNode;
  /** For roomy rows (`isRoomy`): a hairline frame with no tint, the rows' icon chips carrying the colour. */
  isRoomy?: boolean;
  /** What the block is for, in a few words above it ("What would you like to do?"). */
  caption?: string;
}

/** One hairline-edged block for a drawer's related rows (`ActionRow`s with `isGrouped`, or `GroupRow`s), tinted when compact; it draws nothing, caption included, while it has none. */
function ActionGroup({ children, isRoomy = false, caption }: ActionGroupProps) {
  const captionId = useId();
  const frame = (
    <div
      data-action-rows=''
      className={join(
        'border-border divide-border divide-y overflow-hidden rounded-2xl border empty:hidden',
        !isRoomy && 'bg-muted/50',
      )}
    >
      {children}
    </div>
  );

  if (caption === undefined) {
    return frame;
  }

  return (
    <section
      aria-labelledby={captionId}
      className='space-y-2 has-[>[data-action-rows]:empty]:hidden'
    >
      <h3 id={captionId} className='text-muted-foreground text-sm font-medium'>
        {caption}
      </h3>
      {frame}
    </section>
  );
}

export default ActionGroup;
