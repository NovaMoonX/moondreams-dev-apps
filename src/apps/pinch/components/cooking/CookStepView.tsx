import { useMemo, useRef, type PointerEvent } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import SuggestionChips from '@/components/SuggestionChips';
import { findDurations, formatDuration } from '@/utils/durationUtils';
import type { CookRow } from '@apps/pinch/components/cooking/CookIngredientsView';
import { MAX_COOK_TIMERS, MAX_STEP_DOTS } from '@apps/pinch/constants';
import type { CookTimer } from '@apps/pinch/hooks/useCookTimers';

const SWIPE_MIN_PX = 60;
const SWIPE_AXIS_RATIO = 1.5;
const LONG_STEP_CHARS = 160;
const ZOOMED_SCALE = 1.05;

interface CookStepViewProps {
  steps: string[];
  index: number;
  /** The lines this step names, scaled. */
  ingredients: CookRow[];
  isAmountNoteShown: boolean;
  timers: CookTimer[];
  isTimersFull: boolean;
  onStartTimer: (stepNumber: number, seconds: number, label: string) => void;
  onSwipe: (direction: 1 | -1) => void;
}

function CookStepView({
  steps,
  index,
  ingredients,
  isAmountNoteShown,
  timers,
  isTimersFull,
  onStartTimer,
  onSwipe,
}: CookStepViewProps) {
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const step = steps[index];
  const stepNumber = index + 1;
  const found = useMemo(
    () =>
      findDurations(step).map(({ seconds }) => ({
        seconds,
        label: formatDuration(seconds),
        text: `⏲️ Start ${formatDuration(seconds)} timer`,
      })),
    [step],
  );
  const chips = found.filter(
    (chip) =>
      !timers.some(
        (timer) =>
          timer.stepNumber === stepNumber && timer.label === chip.label,
      ),
  );

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
      className='flex flex-1 touch-pan-y touch-pinch-zoom flex-col gap-4'
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        swipeStart.current = null;
      }}
    >
      <div aria-live='polite' aria-atomic='true' className='space-y-4'>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
          <p className='text-muted-foreground text-sm font-medium whitespace-nowrap'>
            Step {stepNumber} of {steps.length}
          </p>
          {steps.length > 1 && steps.length <= MAX_STEP_DOTS && (
            <div className='flex items-center gap-1.5' aria-hidden='true'>
              {steps.map((_, dotIndex) => (
                <span
                  key={dotIndex}
                  className={join(
                    'h-2 rounded-full',
                    dotIndex === index ? 'bg-primary w-5' : 'w-2',
                    dotIndex < index && 'bg-primary/50',
                    dotIndex > index && 'bg-border',
                  )}
                />
              ))}
            </div>
          )}
        </div>
        <p
          className={join(
            'leading-snug font-medium wrap-break-word whitespace-pre-wrap',
            step.length > LONG_STEP_CHARS ? 'text-xl' : 'text-2xl',
            '[@media(max-height:500px)]:text-xl',
          )}
        >
          {step}
        </p>
        {ingredients.length > 0 && (
          <div className='space-y-1'>
            <p className='text-muted-foreground text-xs'>In this step</p>
            <ul className='divide-border divide-y'>
              {ingredients.map((row) => (
                <li
                  key={row.id}
                  className='flex items-baseline justify-between gap-3 py-1.5 text-base'
                >
                  <span className='min-w-0 wrap-break-word'>{row.name}</span>
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
          </div>
        )}
        {isAmountNoteShown && (
          <p className='text-muted-foreground text-xs'>
            Amounts written in this step stay as they are.
          </p>
        )}
      </div>
      {chips.length > 0 && (
        <div className='space-y-2'>
          <SuggestionChips
            label='Timers in this step'
            suggestions={chips.map((chip) => chip.text)}
            isDisabled={isTimersFull}
            onPick={(text) => {
              const chip = chips.find((candidate) => candidate.text === text);
              if (chip) onStartTimer(stepNumber, chip.seconds, chip.label);
            }}
          />
          <div role='status' className='empty:hidden'>
            {isTimersFull && (
              <p className='text-muted-foreground text-xs'>
                {MAX_COOK_TIMERS} timers are going. Dismiss or finish one to
                start another.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CookStepView;
