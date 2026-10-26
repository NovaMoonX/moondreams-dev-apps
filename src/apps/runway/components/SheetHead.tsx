import type { ReactNode } from 'react';

import HelpTip from '@/components/HelpTip';

interface SheetHeadProps {
  /** What the figure is ("Next payment", "Saved", "Left"). */
  label: string;
  figure?: string;
  /** Small words after the figure ("of $600"). */
  suffix?: string;
  /** The one short fact under the figure. */
  fact?: string | null;
  /** A caveat about the figure (which end of a range it is planned at), behind a help icon. */
  help?: ReactNode;
  helpTitle?: string;
}

/** The top of a row's sheet: the figure large, what it is, and one short fact. */
function SheetHead({
  label,
  figure,
  suffix,
  fact,
  help,
  helpTitle,
}: SheetHeadProps) {
  return (
    <div className='border-border bg-accent rounded-2xl border p-4'>
      <div className='flex min-h-6 items-center gap-1'>
        <p className='text-muted-foreground text-sm font-medium'>{label}</p>
        {help && <HelpTip title={helpTitle ?? label}>{help}</HelpTip>}
      </div>
      {figure && (
        <p className='break-words'>
          <span className='text-4xl font-semibold tracking-tight tabular-nums'>
            {figure}
          </span>
          {suffix && (
            <span className='text-muted-foreground ml-2 text-base whitespace-nowrap'>
              {suffix}
            </span>
          )}
        </p>
      )}
      {fact && (
        <p className='text-muted-foreground text-sm break-words'>
          <span className='line-clamp-2'>{fact}</span>
        </p>
      )}
    </div>
  );
}

export default SheetHead;
