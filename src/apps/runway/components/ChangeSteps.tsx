import { useEffect, useRef, type ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

interface ChangeStepsProps {
  isReason: boolean;
  /** The form; it stays in place, unseen, so the sheet keeps its height and what was typed. */
  children: ReactNode;
  reason: ReactNode;
}

/** Swaps an edit's reason step in over its form without the sheet changing height. */
function ChangeSteps({ isReason, children, reason }: ChangeStepsProps) {
  const reasonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isReason) reasonRef.current?.scrollIntoView({ block: 'start' });
  }, [isReason]);

  return (
    <div className='grid'>
      <div
        className={join(
          'col-start-1 row-start-1 min-w-0',
          isReason && 'invisible',
        )}
        aria-hidden={isReason}
      >
        {children}
      </div>
      {isReason && (
        <div
          ref={reasonRef}
          className='col-start-1 row-start-1 flex min-w-0 flex-col'
        >
          {reason}
        </div>
      )}
    </div>
  );
}

export default ChangeSteps;
