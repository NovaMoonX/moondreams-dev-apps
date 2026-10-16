import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

interface GroupRowProps {
  /** An emoji or a small icon, in a fixed column so every row's text starts on one edge. Leave it out when each line of the content brings its own (`GroupRowLines`). */
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  ariaLabel?: string;
}

/** A row inside an `ActionGroup` that sums something up: an icon column, its content and a chevron on the first line, at least 40px tall; a tap opens what it sums up. */
function GroupRow({ icon, children, onClick, ariaLabel }: GroupRowProps) {
  const iconColumn = icon !== undefined && (
    <span className='w-5 shrink-0 text-center' aria-hidden='true'>
      {icon}
    </span>
  );

  return (
    <Button
      type='button'
      variant='tertiary'
      size='stripped'
      rounded='none'
      aria-label={ariaLabel}
      onClick={onClick}
      className='text-foreground! hover:bg-muted flex min-h-10 w-full items-start justify-start gap-3 px-4 py-2.5 text-left text-sm font-normal whitespace-normal'
    >
      {iconColumn}
      <span className='min-w-0 flex-1'>{children}</span>
      <ChevronRight
        className='text-muted-foreground mt-0.5 size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

interface GroupRowLinesProps {
  lines: { key: string; icon: ReactNode; content: ReactNode }[];
}

/** Several lines that one `GroupRow` sums up together, each with its own icon on the row's icon column. */
export function GroupRowLines({ lines }: GroupRowLinesProps) {
  return (
    <span className='grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3'>
      {lines.map((line) => (
        <span key={line.key} className='contents'>
          <span className='text-center' aria-hidden='true'>
            {line.icon}
          </span>
          <span>{line.content}</span>
        </span>
      ))}
    </span>
  );
}

export default GroupRow;
