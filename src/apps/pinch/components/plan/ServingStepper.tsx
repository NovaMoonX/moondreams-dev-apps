import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Minus, Plus } from 'lucide-react';

interface ServingStepperProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
}

/** A half-step stepper with 40px targets, for servings. */
function ServingStepper({
  value,
  onChange,
  label,
  min = 0.5,
  max = 1000,
  step = 0.5,
}: ServingStepperProps) {
  return (
    <div role='group' aria-label={label} className='flex items-center gap-2'>
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        aria-label={`Fewer ${label.toLowerCase()}`}
        disabled={value - step < min}
        onClick={() => onChange(value - step)}
        className='size-10'
      >
        <Minus className='h-4 w-4' aria-hidden='true' />
      </Button>
      <span
        className='min-w-10 text-center text-lg font-semibold tabular-nums'
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
        className='size-10'
      >
        <Plus className='h-4 w-4' aria-hidden='true' />
      </Button>
    </div>
  );
}

export default ServingStepper;
