import type { ReactNode } from 'react';

import { Checkbox } from '@moondreamsdev/dreamer-ui/components';

import SectionDivider from '@/components/SectionDivider';

interface ChecklistGroupProps {
  label: string;
  /** Ticks every line of the group; left out for a list with one group, where the whole list's box already does it. */
  onToggleAll?: (isDone: boolean) => void;
  doneCount: number;
  total: number;
  children: ReactNode;
}

/** A named part of the checklist with its own box, partly ticked while some of its lines are. */
function ChecklistGroup({
  label,
  onToggleAll,
  doneCount,
  total,
  children,
}: ChecklistGroupProps) {
  return (
    <div className='space-y-2'>
      <SectionDivider label={label} />
      {onToggleAll && (
        <div className='flex min-h-10 items-center gap-3 px-1'>
          <Checkbox
            checked={total > 0 && doneCount === total}
            indeterminate={doneCount > 0 && doneCount < total}
            onCheckedChange={(next) => onToggleAll(Boolean(next))}
            aria-label={`Tick all of ${label}`}
          />
          <span className='text-muted-foreground text-sm whitespace-nowrap tabular-nums'>
            {doneCount} of {total}
          </span>
        </div>
      )}
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {children}
      </ul>
    </div>
  );
}

export default ChecklistGroup;
