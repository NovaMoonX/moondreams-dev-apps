import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronLeft } from 'lucide-react';

interface StepGuideProps {
  step?: number;
  stepCount?: number;
  title: ReactNode;
  children: ReactNode;
  primary?: { label: string; onClick: () => void; isDisabled?: boolean };
  /** The previous step; drawn as a smaller button left of the primary, since the header's arrow leaves the whole guide. */
  onBack?: () => void;
  backLabel?: string;
  /** Where no step comes before, the same button leaves the guide; pass the guarded leave from `useLeaveFlowGuard`. */
  onExit?: () => void;
  exitLabel?: string;
}

/** One step of a guided setup; render it as the last child of an overlay Subview, whose form-footer pins its Back and primary. */
function StepGuide({
  step,
  stepCount,
  title,
  children,
  primary,
  onBack,
  backLabel = 'Back',
  onExit,
  exitLabel = 'Exit',
}: StepGuideProps) {
  const way = onBack
    ? { label: backLabel, onClick: onBack, isBack: true }
    : onExit
      ? { label: exitLabel, onClick: onExit, isBack: false }
      : null;
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
      {(primary || way) && (
        <div className='form-footer flex gap-2'>
          {way && (
            <Button
              variant='secondary'
              className={join('gap-1 px-4', primary ? 'shrink-0' : 'flex-1')}
              onClick={way.onClick}
            >
              {way.isBack && (
                <ChevronLeft className='size-4' aria-hidden='true' />
              )}
              {way.label}
            </Button>
          )}
          {primary && (
            <Button
              className='min-w-0 flex-1'
              disabled={primary.isDisabled}
              onClick={primary.onClick}
            >
              {primary.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default StepGuide;
