import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

interface WorkingRingProps {
  children: ReactNode;
  isWorking: boolean;
  className?: string;
}

/** A thin arc that turns around a round mark (an avatar, a logo) while something works; the arc takes the text colour. */
function WorkingRing({ children, isWorking, className }: WorkingRingProps) {
  return (
    <span
      className={join(
        'relative inline-grid shrink-0 place-items-center',
        className,
      )}
    >
      {children}
      {isWorking && (
        <span
          aria-hidden='true'
          className='pointer-events-none absolute -inset-[3px] animate-spin rounded-full border-2 border-current/15 border-t-current motion-reduce:[animation-duration:2.5s]'
        />
      )}
    </span>
  );
}

export default WorkingRing;
