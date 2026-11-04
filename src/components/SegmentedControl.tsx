import type { ComponentType } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** The full phrase for screen readers when the visible word is a short form of it. */
  ariaLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** A small track that hugs its words and leans on the accent, for a switch that sits above a figure rather than across a form. */
  isCompact?: boolean;
}

/** Pick one of two to four settings in a single track of equal segments, the chosen one raised; for a setting, not for switching views. */
function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  isCompact = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      role='group'
      aria-label={label}
      className={join(
        isCompact
          ? 'bg-accent inline-flex w-fit gap-0.5 rounded-lg p-0.5'
          : 'bg-muted @container grid auto-cols-fr grid-flow-col gap-1 rounded-xl p-1',
        className,
      )}
    >
      {options.map(
        ({ value: optionValue, label: optionLabel, icon: Icon, ariaLabel }) => {
          const isSelected = optionValue === value;
          return (
            <Button
              key={optionValue}
              type='button'
              variant='base'
              size='stripped'
              aria-pressed={isSelected}
              aria-label={ariaLabel}
              className={join(
                "relative min-w-0 gap-1.5 font-medium transition-none after:absolute after:inset-x-0 after:content-[''] focus-visible:outline-2 focus-visible:-outline-offset-2",
                isCompact
                  ? 'h-7 rounded-md px-2.5 text-[13px] after:-inset-y-1.5'
                  : 'h-9 rounded-lg px-2 text-sm after:-inset-y-1',
                isSelected && isCompact
                  ? 'bg-background text-primary dark:bg-primary/25 dark:text-foreground shadow-sm'
                  : isSelected
                    ? 'bg-background text-foreground dark:bg-foreground/15 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => onChange(optionValue)}
            >
              {Icon && <Icon className='size-4 shrink-0 @max-3xs:hidden' />}
              <span className={isCompact ? 'whitespace-nowrap' : 'truncate'}>
                {optionLabel}
              </span>
            </Button>
          );
        },
      )}
    </div>
  );
}

export default SegmentedControl;
