import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Minus, Plus } from 'lucide-react';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  /** A smaller stepper for a row in a list; the 40px target is kept by an invisible hit area. */
  isCompact?: boolean;
}

/** A half-step stepper with 40px targets, for a count like servings or portions. */
function Stepper({
  value,
  onChange,
  label,
  min = 0.5,
  max = 1000,
  step = 0.5,
  isCompact = false,
}: StepperProps) {
  return (
    <div
      role='group'
      aria-label={label}
      className={join('flex items-center', isCompact ? 'gap-1' : 'gap-2')}
    >
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        aria-label={`Fewer ${label.toLowerCase()}`}
        disabled={value - step < min}
        onClick={() => onChange(value - step)}
        className={join(
          isCompact
            ? "relative size-8 after:absolute after:-inset-1 after:content-['']"
            : 'size-10',
        )}
      >
        <Minus className='h-4 w-4' aria-hidden='true' />
      </Button>
      <span
        className={join(
          'text-center font-semibold tabular-nums',
          isCompact ? 'min-w-8 text-base' : 'min-w-10 text-lg',
        )}
        aria-live='polite'
      >
        {value}
      </span>
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        aria-label={`More ${label.toLowerCase()}`}
        disabled={value + step > max}
        onClick={() => onChange(value + step)}
        className={join(
          isCompact
            ? "relative size-8 after:absolute after:-inset-1 after:content-['']"
            : 'size-10',
        )}
      >
        <Plus className='h-4 w-4' aria-hidden='true' />
      </Button>
    </div>
  );
}

export default Stepper;
