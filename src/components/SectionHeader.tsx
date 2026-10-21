import { useContext, type ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import { SubviewTitleContext } from '@/contexts/SubviewTitleContext';

/** Each button in the action slot is 28px tall; a pseudo-element gives it the 40px target. */
const HIT_AREA =
  "[&_button]:relative [&_button]:before:absolute [&_button]:before:inset-x-0 [&_button]:before:-inset-y-1.5 [&_button]:before:content-['']";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  /** Controls in the subtitle's place, for a header whose row is better spent on them than on a sentence. */
  lead?: ReactNode;
  action?: ReactNode;
}

function SectionHeader({ title, subtitle, lead, action }: SectionHeaderProps) {
  const subviewTitle = useContext(SubviewTitleContext);

  // A subview's header already shows this title, so only the subtitle and the action remain.
  if (subviewTitle === title) {
    if (!subtitle && !lead && !action) {
      return null;
    }

    return (
      <div className='flex items-center justify-between gap-3'>
        {lead ?? (
          <p className='text-muted-foreground min-w-0 text-sm text-balance'>
            {subtitle}
          </p>
        )}
        {action && <div className={HIT_AREA}>{action}</div>}
      </div>
    );
  }

  return (
    <div className='flex items-start justify-between gap-3'>
      <div className='min-w-0'>
        <h2 className='flex h-10 items-center text-xl font-semibold'>
          {title}
        </h2>
        {subtitle && (
          <p className='text-muted-foreground -mt-1 text-sm text-balance'>
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div className={join('flex h-10 shrink-0 items-center', HIT_AREA)}>
          {action}
        </div>
      )}
    </div>
  );
}

export default SectionHeader;
