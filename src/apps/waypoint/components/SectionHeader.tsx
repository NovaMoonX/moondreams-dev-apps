import type { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
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
