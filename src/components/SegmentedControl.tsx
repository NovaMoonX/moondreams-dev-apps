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
}

/** Pick one of two to four settings in a single track of equal segments, the chosen one raised; for a setting, not for switching views. */
function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role='group'
      aria-label={label}
      className={join(
        'bg-muted @container grid auto-cols-fr grid-flow-col gap-1 rounded-xl p-1',
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
                "relative h-9 min-w-0 gap-1.5 rounded-lg px-2 text-sm font-medium transition-none after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
                isSelected
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => onChange(optionValue)}
            >
              {Icon && <Icon className='size-4 shrink-0 @max-3xs:hidden' />}
              <span className='truncate'>{optionLabel}</span>
            </Button>
          );
        },
      )}
    </div>
  );
}

export default SegmentedControl;
