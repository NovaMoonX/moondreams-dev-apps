import type { ReactNode } from 'react';

import { Checkbox } from '@moondreamsdev/dreamer-ui/components';

import SectionDivider from '@/components/SectionDivider';

/** A 20px tick gets a 40px hit area from a pseudo-element, so a tap near it still ticks it. */
export const TICK_HIT_CLASS =
  "relative before:absolute before:-inset-[11px] before:content-['']";

interface ChecklistGroupProps {
  /** Left out for a group with no name (the lines before the first named group): no divider is drawn. */
  label?: string;
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
      {label && <SectionDivider label={label} />}
      {onToggleAll && (
        <div className='flex min-h-10 items-center gap-3 px-[13px]'>
          <Checkbox
            className={TICK_HIT_CLASS}
            checked={total > 0 && doneCount === total}
            indeterminate={doneCount > 0 && doneCount < total}
            onCheckedChange={(next) => onToggleAll(Boolean(next))}
            aria-label={label ? `Tick all of ${label}` : 'Tick all'}
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
