import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import SwipeArea from '@/components/SwipeArea';
import type { CookRow } from '@apps/pinch/components/cooking/CookIngredientsView';
import CookStepAmounts from '@apps/pinch/components/cooking/CookStepAmounts';
import CookStepTimer from '@apps/pinch/components/cooking/CookStepTimer';
import { MAX_COOK_TIMERS } from '@apps/pinch/constants';

const LONG_STEP_CHARS = 160;
const VERY_LONG_STEP_CHARS = 400;

export interface StepTimerSlot {
  seconds: number;
  label: string;
  /** It already ran and its Time's up was dismissed this session. */
  isDone: boolean;
}

interface CookStepViewProps {
  steps: string[];
  index: number;
  /** The lines this step names, scaled. */
  ingredients: CookRow[];
  isAmountNoteShown: boolean;
  /** The times the step mentions that have no timer yet. */
  timerSlots: StepTimerSlot[];
  isTimersFull: boolean;
  /** Sits at the end of the step counter's row (the way to the ingredient list on a phone). */
  action: ReactNode;
  onStartTimer: (stepNumber: number, seconds: number, label: string) => void;
  onSwipe: (direction: 1 | -1) => void;
}

/** The digits sit a size below the words so a ready card never outweighs the instruction; a short screen takes a size off both so the step and its card fit above the pinned buttons. */
const getStepType = (length: number) => {
  if (length > VERY_LONG_STEP_CHARS) {
    return {
      step: 'text-xl leading-snug [@media(max-height:640px)]:text-lg',
      clock: 'text-xl [@media(max-height:640px)]:text-lg',
    };
  }
  if (length > LONG_STEP_CHARS) {
    return {
      step: 'text-2xl leading-snug [@media(max-height:640px)]:text-xl',
      clock: 'text-xl [@media(max-height:640px)]:text-lg',
    };
  }
  return {
    step: 'text-[1.75rem] leading-[1.3] lg:text-3xl [@media(max-height:640px)]:text-2xl',
    clock: 'text-2xl [@media(max-height:640px)]:text-xl',
  };
};

function CookStepView({
  steps,
  index,
  ingredients,
  isAmountNoteShown,
  timerSlots,
  isTimersFull,
  action,
  onStartTimer,
  onSwipe,
}: CookStepViewProps) {
  const step = steps[index];
  const stepNumber = index + 1;
  const type = getStepType(step.length);

  return (
    <SwipeArea className='flex flex-1 flex-col' onSwipe={onSwipe}>
      <div className='flex min-h-10 items-center gap-3'>
        <div
          aria-hidden='true'
          className='flex min-w-0 flex-1 items-center gap-3'
        >
          <p className='text-muted-foreground text-sm font-medium whitespace-nowrap'>
            Step {stepNumber} of {steps.length}
          </p>
          {steps.length > 1 && (
            <div className='bg-border h-1.5 max-w-32 min-w-6 flex-1 overflow-hidden rounded-full'>
              <div
                className='bg-primary h-full rounded-full'
                style={{ width: `${(stepNumber / steps.length) * 100}%` }}
              />
            </div>
          )}
        </div>
        {action}
      </div>
      <div aria-live='polite' aria-atomic='true' className='mt-3'>
        <span className='sr-only'>
          Step {stepNumber} of {steps.length}.{' '}
        </span>
        <p
          className={join(
            'font-medium wrap-break-word whitespace-pre-wrap',
            type.step,
          )}
        >
          {step}
        </p>
      </div>
      {timerSlots.length > 0 && (
        <div className='mt-6 space-y-2 [@media(max-height:640px)]:mt-4'>
          <ul aria-label='Timers in this step' className='space-y-2'>
            {timerSlots.map((slot) => (
              <CookStepTimer
                key={`${stepNumber}-${slot.label}`}
                seconds={slot.seconds}
                label={slot.label}
                clockClassName={type.clock}
                isCompact={timerSlots.length > 1}
                isDone={slot.isDone}
                canStart={!isTimersFull}
                onStart={() =>
                  onStartTimer(stepNumber, slot.seconds, slot.label)
                }
              />
            ))}
          </ul>
          <div role='status' className='empty:hidden'>
            {isTimersFull && (
              <p className='text-muted-foreground text-xs'>
                {MAX_COOK_TIMERS} timers are going. Another can start once one
                finishes or is reset.
              </p>
            )}
          </div>
        </div>
      )}
      <CookStepAmounts
        rows={ingredients}
        isAmountNoteShown={isAmountNoteShown}
        className={
          ingredients.length === 0
            ? 'mt-6'
            : timerSlots.length > 0
              ? 'mt-6 [@media(max-height:500px)]:mt-4'
              : 'mt-8 [@media(max-height:500px)]:mt-5'
        }
      />
    </SwipeArea>
  );
}

export default CookStepView;
