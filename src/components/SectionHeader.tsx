import { useContext, type ReactNode } from 'react';

import { SubviewTitleContext } from '@/contexts/SubviewTitleContext';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  const subviewTitle = useContext(SubviewTitleContext);

  // A subview's header already shows this title, so only the subtitle and the action remain.
  if (subviewTitle === title) {
    if (!subtitle && !action) {
      return null;
    }

    return (
      <div className='flex items-center justify-between gap-3'>
        <p className='text-muted-foreground min-w-0 text-sm'>{subtitle}</p>
        {action}
      </div>
    );
  }

  return (
    <div className='flex items-start justify-between gap-3'>
      <div className='min-w-0'>
        <h2 className='flex h-10 items-center text-xl font-semibold'>{title}</h2>
        {subtitle && <p className='text-muted-foreground -mt-1 text-sm'>{subtitle}</p>}
      </div>
      {action && <div className='flex h-10 shrink-0 items-center'>{action}</div>}
    </div>
  );
}

export default SectionHeader;
