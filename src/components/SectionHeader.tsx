import { useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { SubviewContext } from '@/contexts/SubviewContext';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  const subview = useContext(SubviewContext);

  // Inside a subview whose header already shows this title, the title and the action move up there.
  if (subview?.title === title) {
    return (
      <>
        {action && subview.actionTarget
          ? createPortal(action, subview.actionTarget)
          : null}
        {subtitle && <p className='text-muted-foreground text-sm'>{subtitle}</p>}
      </>
    );
  }

  return (
    <div className='flex items-start justify-between gap-3'>
      <div className='min-w-0'>
        <h2 className='flex h-10 items-center text-xl font-semibold'>{title}</h2>
        {subtitle && <p className='text-muted-foreground -mt-1 text-sm'>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export default SectionHeader;
