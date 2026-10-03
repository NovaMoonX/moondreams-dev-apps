import { join } from '@moondreamsdev/dreamer-ui/utils';

interface SetupStepperProps {
  step: number;
  total: number;
}

function SetupStepper({ step, total }: SetupStepperProps) {
  return (
    <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase'>
      <span>
        Step {step + 1} of {total}
      </span>
      <span className='flex items-center gap-1' aria-hidden='true'>
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={join(
              'h-1.5 w-1.5 rounded-full',
              index <= step ? 'bg-primary' : 'bg-muted-foreground/30',
            )}
          />
        ))}
      </span>
    </div>
  );
}

export default SetupStepper;
