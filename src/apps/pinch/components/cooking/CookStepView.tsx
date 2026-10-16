import { useRef, type PointerEvent, type ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { CookRow } from '@apps/pinch/components/cooking/CookIngredientsView';
import CookStepTimer from '@apps/pinch/components/cooking/CookStepTimer';
import { MAX_COOK_TIMERS } from '@apps/pinch/constants';
import type { CookTimer } from '@apps/pinch/hooks/useCookTimers';

const SWIPE_MIN_PX = 60;
const SWIPE_AXIS_RATIO = 1.5;
const LONG_STEP_CHARS = 160;
const VERY_LONG_STEP_CHARS = 400;
const ZOOMED_SCALE = 1.05;

export interface StepTimerSlot {
  seconds: number;
  label: string;
  timer: CookTimer | null;
}

interface CookStepViewProps {
  steps: string[];
  index: number;
  /** The lines this step names, scaled. */
  ingredients: CookRow[];
  isAmountNoteShown: boolean;
  timerSlots: StepTimerSlot[];
  /** Null unless one of the step's cards holds a timer. */
  timerNote: string | null;
  isTimersFull: boolean;
  /** Sits at the end of the step counter's row (the way to the ingredient list on a phone). */
  action: ReactNode;
  onStartTimer: (stepNumber: number, seconds: number, label: string) => void;
  onPauseTimer: (id: string) => void;
  onResumeTimer: (id: string) => void;
  onDismissTimer: (id: string) => void;
  onTimerTick: () => void;
  onSwipe: (direction: 1 | -1) => void;
}

/** The digits sit a size below the words so a running timer never outweighs the instruction; a short screen takes a size off both so the step and its card fit above the pinned buttons. */
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
  timerNote,
  isTimersFull,
  action,
  onStartTimer,
  onPauseTimer,
  onResumeTimer,
  onDismissTimer,
  onTimerTick,
  onSwipe,
}: CookStepViewProps) {
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const step = steps[index];
  const stepNumber = index + 1;
  const hasIdleSlot = timerSlots.some((slot) => slot.timer === null);
  const type = getStepType(step.length);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeStart.current =
      event.pointerType === 'mouse' || !event.isPrimary
        ? null
        : { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || (window.visualViewport?.scale ?? 1) > ZOOMED_SCALE) {
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (
      Math.abs(dx) >= SWIPE_MIN_PX &&
      Math.abs(dx) >= Math.abs(dy) * SWIPE_AXIS_RATIO
    ) {
      onSwipe(dx < 0 ? 1 : -1);
    }
  };

  return (
    <div
      className='flex flex-1 touch-pan-y touch-pinch-zoom flex-col'
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        swipeStart.current = null;
      }}
    >
      <div data-cook-stop='' className='flex min-h-10 items-center gap-3'>
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
          data-cook-stop=''
          className={join(
            'font-medium wrap-break-word whitespace-pre-wrap',
            type.step,
          )}
        >
          {step}
        </p>
      </div>
      {timerSlots.length > 0 && (
        <div
          data-cook-timers=''
          className='mt-6 space-y-2 [@media(max-height:640px)]:mt-4'
        >
          <ul aria-label='Timers in this step' className='space-y-2'>
            {timerSlots.map((slot) => (
              <CookStepTimer
                key={`${stepNumber}-${slot.label}`}
                seconds={slot.seconds}
                label={slot.label}
                timer={slot.timer}
                clockClassName={type.clock}
                isCompact={timerSlots.length > 1}
                canStart={!isTimersFull}
                onStart={() =>
                  onStartTimer(stepNumber, slot.seconds, slot.label)
                }
                onPause={onPauseTimer}
                onResume={onResumeTimer}
                onDismiss={onDismissTimer}
                onTick={onTimerTick}
              />
            ))}
          </ul>
          <div role='status' className='empty:hidden'>
            {isTimersFull && hasIdleSlot && (
              <p className='text-muted-foreground text-xs'>
                {MAX_COOK_TIMERS} timers are going. Another can start once one
                finishes or is reset.
              </p>
            )}
            {timerNote && (
              <p className='text-muted-foreground text-xs'>{timerNote}</p>
            )}
          </div>
        </div>
      )}
      {ingredients.length > 0 ? (
        <section
          aria-label='For this step'
          className={join(
            'bg-muted/50 border-border rounded-2xl border px-4 py-3',
            timerSlots.length > 0
              ? 'mt-6 [@media(max-height:500px)]:mt-4'
              : 'mt-8 [@media(max-height:500px)]:mt-5',
          )}
        >
          <p className='text-muted-foreground text-xs font-medium'>
            For this step
          </p>
          <ul className='divide-border mt-1 divide-y'>
            {ingredients.map((row) => (
              <li
                key={row.id}
                className='flex items-baseline justify-between gap-3 py-1.5 text-sm'
              >
                <span className='min-w-0 wrap-break-word'>
                  {row.name}
                  {row.groupLabel && (
                    <span className='text-muted-foreground text-xs'>
                      {' '}
                      · {row.groupLabel}
                    </span>
                  )}
                </span>
                <span
                  className={
                    row.isMeasured
                      ? 'shrink-0 font-semibold whitespace-nowrap'
                      : 'text-muted-foreground max-w-[50%] text-right wrap-break-word'
                  }
                >
                  {row.amountText}
                </span>
              </li>
            ))}
          </ul>
          {isAmountNoteShown && (
            <p className='text-muted-foreground border-border mt-1 border-t pt-2 text-xs'>
              Amounts written in this step stay as they are.
            </p>
          )}
        </section>
      ) : (
        isAmountNoteShown && (
          <p className='text-muted-foreground mt-6 text-xs'>
            Amounts written in this step stay as they are.
          </p>
        )
      )}
    </div>
  );
}

export default CookStepView;
