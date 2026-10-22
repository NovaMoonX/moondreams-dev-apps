import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import SwipeArea from '@/components/SwipeArea';
import type { CookRow } from '@apps/pinch/components/cooking/CookIngredientsView';
import CookStepTimer from '@apps/pinch/components/cooking/CookStepTimer';
import type { RecipeNote } from '@apps/pinch/types';
import CookStepDock, {
  type DockView,
} from '@apps/pinch/components/cooking/CookStepDock';
import { MAX_COOK_TIMERS } from '@apps/pinch/constants';

const SIDE_BY_SIDE = {
  top: '[@media(max-height:500px)_and_(min-width:640px)]:flex-row [@media(max-height:500px)_and_(min-width:640px)]:items-center [@media(max-height:500px)_and_(min-width:640px)]:gap-8',
  dishes:
    '[@media(max-height:500px)_and_(min-width:640px)]:min-w-0 [@media(max-height:500px)_and_(min-width:640px)]:flex-1',
  counter:
    '[@media(max-height:500px)_and_(min-width:640px)]:w-88 [@media(max-height:500px)_and_(min-width:640px)]:shrink-0',
  counterAlone: '[@media(max-height:500px)_and_(min-width:640px)]:flex-1',
  grid: '[@media(max-height:500px)_and_(min-width:640px)]:grid [@media(max-height:500px)_and_(min-width:640px)]:grid-cols-[minmax(0,1fr)_22rem] [@media(max-height:500px)_and_(min-width:640px)]:content-start [@media(max-height:500px)_and_(min-width:640px)]:gap-x-8',
  column:
    '[@media(max-height:500px)_and_(min-width:640px)]:mt-0 [@media(max-height:500px)_and_(min-width:640px)]:pt-5',
};

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
  /** Where the first step leads with the recipe's latest note, until "Got it"; null elsewhere. */
  lastTime: { recipeId: string; isDismissed: boolean; onGotIt: () => void } | null;
  /** What was written for this step, tips first. */
  entries: RecipeNote[];
  onEditEntry: (id: string) => void;
  onApplyChange: (id: string) => void;
  onReadEntries: ((kind: 'TIP' | 'NOTE' | 'CHANGE') => void) | null;
  /** The view open above the step's bubbles, if any. */
  shownView: DockView | null;
  onShowView: (view: DockView | null) => void;
  /** Starts a new tip, note or change for this step; null where none can be written. */
  onAddEntry: (() => void) | null;
  dishes: ReactNode;
  /** The times the step mentions that have no timer yet. */
  timerSlots: StepTimerSlot[];
  isTimersFull: boolean;
  /** Sits at the end of the step counter's row (the way to the ingredient list on a phone). */
  action: ReactNode | null;
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
    step: 'text-[1.75rem] leading-[1.35] lg:text-3xl [@media(max-height:640px)]:text-2xl',
    clock: 'text-2xl [@media(max-height:640px)]:text-xl',
  };
};

function CookStepView({
  steps,
  index,
  ingredients,
  isAmountNoteShown,
  lastTime,
  entries,
  onEditEntry,
  onApplyChange,
  onReadEntries,
  shownView,
  onShowView,
  onAddEntry,
  dishes,
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
      <div
        className={join(
          'flex flex-col gap-4 [@media(max-height:640px)_and_(max-width:639px)]:gap-2',
          SIDE_BY_SIDE.top,
        )}
      >
        {dishes && <div className={SIDE_BY_SIDE.dishes}>{dishes}</div>}
        <div
          className={join(
            'flex min-h-10 items-center gap-3',
            dishes ? SIDE_BY_SIDE.counter : SIDE_BY_SIDE.counterAlone,
          )}
        >
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
      </div>
      <div className={join('flex flex-1 flex-col', SIDE_BY_SIDE.grid)}>
        <div className='pt-8 [@media(max-height:640px)]:pt-5'>
          <div aria-live='polite' aria-atomic='true'>
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
            <div className='mt-8 space-y-2 [@media(max-height:640px)]:mt-5'>
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
                    {MAX_COOK_TIMERS} timers are going. Another can start once
                    one finishes or is reset.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <div
          className={join(
            'mt-auto space-y-3 pt-8 empty:hidden',
            timerSlots.length > 0
              ? '[@media(max-height:640px)]:pt-3'
              : '[@media(max-height:640px)]:pt-5',
            SIDE_BY_SIDE.column,
          )}
        >
          <CookStepDock
            key={stepNumber}
            rows={ingredients}
            isAmountNoteShown={isAmountNoteShown}
            entries={entries}
            onEdit={onEditEntry}
            onApplyChange={onApplyChange}
            onRead={onReadEntries}
            onAdd={onAddEntry}
            lastTime={lastTime}
            shown={shownView}
            onShow={onShowView}
          />
        </div>
      </div>
    </SwipeArea>
  );
}

export default CookStepView;
