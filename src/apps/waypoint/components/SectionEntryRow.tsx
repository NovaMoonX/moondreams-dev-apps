import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

interface SectionEntryRowProps {
  heading: string;
  icon: ReactNode;
  title: string;
  summary: string;
  onOpen: () => void;
}

function SectionEntryRow({ heading, icon, title, summary, onOpen }: SectionEntryRowProps) {
  return (
    <section className='space-y-1'>
      <h3 className='text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase'>
        {heading}
      </h3>
      <Button
        type='button'
        variant='tertiary'
        onClick={onOpen}
        className='border-border h-auto w-full justify-start gap-3 rounded-xl border px-3 py-3 text-left'
      >
        <span className='text-muted-foreground shrink-0'>{icon}</span>
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-sm font-medium'>{title}</span>
          <span className='text-muted-foreground block text-xs'>{summary}</span>
        </span>
        <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
      </Button>
    </section>
  );
}

export default SectionEntryRow;
