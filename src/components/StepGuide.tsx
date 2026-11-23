import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

interface StepGuideProps {
  step?: number;
  stepCount?: number;
  title: ReactNode;
  children: ReactNode;
  primary?: { label: string; onClick: () => void; isDisabled?: boolean };
  secondary?: ReactNode;
}

/** One step of a guided setup; render it as the last child of an overlay Subview with `onBack`, whose form-footer pins its primary. */
function StepGuide({
  step,
  stepCount,
  title,
  children,
  primary,
  secondary,
}: StepGuideProps) {
  return (
    <div className='flex flex-1 flex-col'>
      <div className='space-y-5 pb-6'>
        {step !== undefined && stepCount !== undefined && (
          <div className='space-y-1.5'>
            <div
              role='progressbar'
              aria-valuemin={1}
              aria-valuemax={stepCount}
              aria-valuenow={step}
              aria-label={`Step ${step} of ${stepCount}`}
              className='bg-muted h-1.5 overflow-hidden rounded-full'
            >
              <div
                className='bg-primary h-full rounded-full'
                style={{ width: `${(step / stepCount) * 100}%` }}
              />
            </div>
            <p className='text-muted-foreground text-xs'>
              Step {step} of {stepCount}
            </p>
          </div>
        )}
        <h2 className='text-2xl font-semibold break-words'>{title}</h2>
        {children}
      </div>
      {primary && (
        <div className='form-footer space-y-2'>
          {secondary && <div className='flex justify-center'>{secondary}</div>}
          <Button
            className='w-full'
            disabled={primary.isDisabled}
            onClick={primary.onClick}
          >
            {primary.label}
          </Button>
        </div>
      )}
    </div>
  );
}

export default StepGuide;
