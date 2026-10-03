import { join } from '@moondreamsdev/dreamer-ui/utils';

interface SetupStepperProps {
  step: number;
  total: number;
}

function SetupStepper({ step, total }: SetupStepperProps) {
  return (
    <div
      className='flex items-center justify-center gap-1.5'
      role='img'
      aria-label={`Step ${step + 1} of ${total}`}
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={join(
            'h-1.5 rounded-full transition-all',
            index === step ? 'bg-primary w-6' : 'w-1.5',
            index < step && 'bg-primary/60',
            index > step && 'bg-muted-foreground/30',
          )}
        />
      ))}
    </div>
  );
}

export default SetupStepper;
