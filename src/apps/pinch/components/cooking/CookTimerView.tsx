import { useEffect, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  BellRing,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';

import SwipeArea from '@/components/SwipeArea';
import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { formatClock } from '@/utils/durationUtils';
import type { CookRow } from '@apps/pinch/components/cooking/CookIngredientsView';
import CookStepAmounts from '@apps/pinch/components/cooking/CookStepAmounts';
import type { StepTimerSlot } from '@apps/pinch/components/cooking/CookStepView';
import {
  getRemainingMs,
  type CookTimer,
} from '@apps/pinch/hooks/useCookTimers';
import { getRangAgo } from '@apps/pinch/utils/cooks';

const TICK_MS = 250;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const ICON_BUTTON_CLASS =
  "relative size-10 shrink-0 after:absolute after:-inset-0.5 after:content-['']";

interface CookTimerViewProps {
  timer: CookTimer;
  /** The timer's recipe, named only when the session cooks several. */
  recipeTitle: string | null;
  stepNumber: number;
  stepCount: number;
  stepText: string;
  stepRows: CookRow[];
  isAmountNoteShown: boolean;
  /** The session's other timers, finished ones first. */
  others: CookTimer[];
  /** The timer's step's other times that have no timer yet and could start now. */
  readySlots: StepTimerSlot[];
  upNext: { caption: string; text: string } | null;
  /** On a plate, the other recipe that has a step to do while this one waits. */
  meanwhile: { title: string; stepNumber: number; stepCount: number } | null;
  /** The keep-the-screen-open line, only while the timer runs. */
  note: string | null;
  /** What sits under the timer card: the offer to buzz this device when the screen is off. */
  buzz: ReactNode;
  onTick: () => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onReset: (id: string) => void;
  onFocus: (id: string) => void;
  onStart: (seconds: number, label: string) => void;
  onMeanwhile: () => void;
  onSwipe: (direction: 1 | -1) => void;
}

/** While a timer is in focus it is the screen: the time left, large, with what it is for, its other timers and what comes next; the step itself is one tap away. Its Pause or Dismiss is the footer's primary. */
function CookTimerView({
  timer,
  recipeTitle,
  stepNumber,
  stepCount,
  stepText,
  stepRows,
  isAmountNoteShown,
  others,
  readySlots,
  upNext,
  meanwhile,
  note,
  buzz,
  onTick,
  onPause,
  onResume,
  onReset,
  onFocus,
  onStart,
  onMeanwhile,
  onSwipe,
}: CookTimerViewProps) {
  const [isStepShown, setIsStepShown] = useState(false);
  const [isReadyShown, setIsReadyShown] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const isTicking = [timer, ...others].some(
    (candidate) => candidate.status === 'running',
  );
  const endedAt = timer.status === 'done' ? timer.endedAt : null;
  const rangMinutes =
    endedAt === null ? 0 : Math.floor(Math.max(0, now - endedAt) / MINUTE_MS);

  useOnTabReturn(() => setNow(Date.now()));

  useEffect(() => {
    if (!isTicking) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
      onTick();
    }, TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [isTicking, onTick]);

  useEffect(() => {
    if (endedAt === null) {
      return;
    }

    const age = Math.max(0, Date.now() - endedAt);
    const timeoutId = window.setTimeout(
      () => setNow(Date.now()),
      MINUTE_MS - (age % MINUTE_MS) + 50,
    );
    return () => window.clearTimeout(timeoutId);
  }, [endedAt, rangMinutes]);

  const remainingMs = getRemainingMs(timer, now);
  const progress =
    timer.status === 'done' || timer.durationMs <= 0
      ? 1
      : Math.min(1, Math.max(0, 1 - remainingMs / timer.durationMs));
  const isDone = timer.status === 'done';
  const isPaused = timer.status === 'paused';
  const sharesStep = (candidate: CookTimer) =>
    [timer, ...others].some(
      (other) =>
        other.id !== candidate.id &&
        other.recipeId === candidate.recipeId &&
        other.stepNumber === candidate.stepNumber,
    );
  const getRowName = (other: CookTimer) =>
    sharesStep(other) ? `${other.label} · ${other.stepName}` : other.stepName;
  const getRowTime = (other: CookTimer) =>
    other.status === 'done'
      ? "Time's up"
      : formatClock(getRemainingMs(other, now));
  const rowTimeClass = (other: CookTimer) =>
    join(
      'shrink-0 text-lg font-semibold whitespace-nowrap tabular-nums',
      other.status === 'paused' && 'text-muted-foreground',
    );
  const rowTitle = (other: CookTimer) => (
    <span className='min-w-0 flex-1'>
      <span className='block text-sm font-medium wrap-break-word'>
        {getRowName(other)}
      </span>
      {other.recipeTitle !== null && (
        <span className='text-muted-foreground block truncate text-xs'>
          {other.recipeTitle}
        </span>
      )}
    </span>
  );

  return (
    <SwipeArea
      onSwipe={onSwipe}
      className={join(
        'mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 [@media(max-height:600px)_and_(min-height:501px)]:gap-2 [@media(max-height:640px)]:gap-3',
        '[@media(max-height:500px)]:grid [@media(max-height:500px)]:max-w-none [@media(max-height:500px)]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [@media(max-height:500px)]:content-start [@media(max-height:500px)]:gap-x-6',
      )}
    >
      <div className='min-w-0 [@media(max-height:500px)]:col-start-2'>
        <Button
          type='button'
          variant='tertiary'
          className='text-muted-foreground! h-10 w-full justify-between gap-2 px-0! text-left text-sm font-normal'
          aria-expanded={isStepShown}
          onClick={() => setIsStepShown((current) => !current)}
        >
          <span className='min-w-0 flex-1 truncate'>
            Step {stepNumber} of {stepCount} ·{' '}
            {isStepShown ? 'Hide this step' : 'Show this step'}
          </span>
          <ChevronDown
            className={join(
              'h-4 w-4 shrink-0 transition-transform',
              isStepShown && 'rotate-180',
            )}
            aria-hidden='true'
          />
        </Button>
      </div>
      <div className='my-auto flex flex-col gap-4 [@media(max-height:500px)]:contents [@media(max-height:600px)_and_(min-height:501px)]:gap-2 [@media(max-height:640px)]:gap-3'>
        <div
          className={join(
            'min-w-0 [@media(max-height:500px)]:col-start-1 [@media(max-height:500px)]:row-span-3 [@media(max-height:500px)]:row-start-1',
            isStepShown
              ? '[@media(max-height:500px)]:self-start'
              : '[@media(max-height:500px)]:my-auto',
          )}
        >
          <section
            aria-label={`${timer.label} timer`}
            className={join(
              '@container rounded-3xl border px-5 pt-4 pb-4 text-center [@media(max-height:640px)]:pt-3 [@media(max-height:640px)]:pb-3',
              isDone && 'border-primary bg-accent',
              isPaused && 'border-border bg-muted/50',
              timer.status === 'running' &&
                'border-[var(--pinch-drizzle)] bg-[var(--pinch-drizzle-soft)]',
            )}
          >
            {recipeTitle !== null && (
              <p className='text-muted-foreground truncate text-sm'>
                {recipeTitle}
              </p>
            )}
            <p className='text-base font-medium text-balance wrap-break-word'>
              {timer.stepName} · {timer.label}
            </p>
            {isDone ? (
              <p className='flex items-center justify-center gap-3 py-3 text-[clamp(2.5rem,17cqi,5rem)] leading-none font-semibold whitespace-nowrap [@media(max-height:640px)]:py-2'>
                <BellRing
                  className='size-[0.7em] shrink-0 motion-safe:animate-pulse'
                  aria-hidden='true'
                />
                Time's up
              </p>
            ) : (
              <p
                aria-hidden='true'
                className={join(
                  'py-1 leading-none font-medium tracking-tight whitespace-nowrap tabular-nums',
                  remainingMs >= HOUR_MS
                    ? 'text-[clamp(4rem,22cqi,7rem)]'
                    : 'text-[clamp(4.5rem,28cqi,9rem)]',
                  isPaused && 'text-muted-foreground',
                )}
              >
                {formatClock(remainingMs)}
              </p>
            )}
            <div className='bg-border mt-2 h-2 overflow-hidden rounded-full'>
              <div
                className={join(
                  'h-full rounded-full transition-[width] duration-300 ease-linear',
                  isDone && 'bg-primary',
                  isPaused && 'bg-muted-foreground/50',
                  timer.status === 'running' && 'bg-[var(--pinch-drizzle)]',
                )}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div className='mt-2 flex h-7 items-center justify-center gap-1.5 text-sm'>
              {isPaused && (
                <>
                  <span className='text-muted-foreground'>Paused</span>
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    className="relative h-7 gap-1.5 rounded-full px-3 text-sm after:absolute after:-inset-1.5 after:content-['']"
                    aria-label={`Reset the ${timer.label} timer`}
                    onClick={() => onReset(timer.id)}
                  >
                    <RotateCcw className='h-4 w-4' aria-hidden='true' />
                    Reset
                  </Button>
                </>
              )}
              {endedAt !== null && (
                <span className='text-muted-foreground'>
                  {getRangAgo(now - endedAt)}
                </span>
              )}
            </div>
            <span role='status' className='sr-only'>
              {isDone ? `The ${timer.label} timer is done.` : ''}
            </span>
          </section>
        </div>
        {buzz && (
          <div className='min-w-0 [@media(max-height:500px)]:col-start-2'>
            {buzz}
          </div>
        )}
        {isStepShown && (
          <div className='min-w-0 space-y-3 [@media(max-height:500px)]:col-start-2'>
            <p className='text-xl leading-snug font-medium wrap-break-word whitespace-pre-wrap'>
              {stepText}
            </p>
            <CookStepAmounts
              rows={stepRows}
              isAmountNoteShown={isAmountNoteShown}
            />
          </div>
        )}
        {others.length > 0 && (
          <section
            aria-label='Other timers'
            className='min-w-0 [@media(max-height:500px)]:col-start-2'
          >
            <p className='text-muted-foreground text-xs font-medium'>
              Other timers
            </p>
            <ul className='border-border divide-border mt-1.5 divide-y rounded-2xl border'>
              {others.map((other) => {
                const otherStatus =
                  other.status === 'done'
                    ? ", time's up"
                    : other.status === 'paused'
                      ? ', paused'
                      : '';
                return isDone ? (
                  <li
                    key={other.id}
                    className='flex min-h-14 items-center gap-3 px-4 py-2 [@media(max-height:640px)]:min-h-12'
                  >
                    {rowTitle(other)}
                    <span className={rowTimeClass(other)}>
                      {getRowTime(other)}
                    </span>
                  </li>
                ) : (
                  <li
                    key={other.id}
                    className='flex min-h-14 items-center gap-3 pr-2 [@media(max-height:640px)]:min-h-12'
                  >
                    <Button
                      type='button'
                      variant='tertiary'
                      className='text-foreground! h-auto min-h-14 min-w-0 flex-1 justify-between gap-3 py-2 pr-0! pl-4! text-left font-normal [@media(max-height:640px)]:min-h-12'
                      aria-label={`Show the ${other.label} timer: ${other.recipeTitle === null ? '' : `${other.recipeTitle} · `}${other.stepName}${otherStatus}`}
                      onClick={() => onFocus(other.id)}
                    >
                      {rowTitle(other)}
                      <span className={rowTimeClass(other)}>
                        {getRowTime(other)}
                      </span>
                    </Button>
                    <Button
                      type='button'
                      variant='secondary'
                      size='icon'
                      rounded='full'
                      className={ICON_BUTTON_CLASS}
                      aria-label={`${other.status === 'running' ? 'Pause' : 'Resume'} the ${other.label} timer: ${other.stepName}`}
                      onClick={() =>
                        other.status === 'running'
                          ? onPause(other.id)
                          : onResume(other.id)
                      }
                    >
                      {other.status === 'running' ? (
                        <Pause className='h-4 w-4' aria-hidden='true' />
                      ) : (
                        <Play className='h-4 w-4' aria-hidden='true' />
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {readySlots.length > 0 && !isDone && (
          <section
            aria-label='More timers on this step'
            className='min-w-0 [@media(max-height:500px)]:col-start-2'
          >
            <Button
              type='button'
              variant='tertiary'
              className='text-muted-foreground! h-10 w-full justify-between gap-2 px-0! text-left text-sm font-normal'
              aria-expanded={isReadyShown}
              onClick={() => setIsReadyShown((current) => !current)}
            >
              <span className='min-w-0 flex-1 truncate'>
                {readySlots.length}{' '}
                {readySlots.length === 1 ? 'more timer' : 'more timers'} on this
                step · {isReadyShown ? 'Hide' : 'Show'}
              </span>
              <ChevronDown
                className={join(
                  'h-4 w-4 shrink-0 transition-transform',
                  isReadyShown && 'rotate-180',
                )}
                aria-hidden='true'
              />
            </Button>
            {isReadyShown && (
              <ul className='border-border divide-border divide-y rounded-2xl border'>
                {readySlots.map((slot) => (
                  <li
                    key={`ready-${slot.label}`}
                    className='flex min-h-14 items-center gap-3 pr-2 pl-4 [@media(max-height:640px)]:min-h-12'
                  >
                    <span className='min-w-0 flex-1 text-sm font-medium wrap-break-word'>
                      {slot.label}
                      {slot.isDone && (
                        <span className='text-muted-foreground font-normal'>
                          {' '}
                          · Done
                        </span>
                      )}
                    </span>
                    <Button
                      type='button'
                      variant='secondary'
                      className='h-10 shrink-0 gap-1.5 px-3 text-sm'
                      aria-label={
                        slot.isDone
                          ? `Start again: the ${slot.label} timer`
                          : `Start the ${slot.label} timer`
                      }
                      onClick={() => onStart(slot.seconds, slot.label)}
                    >
                      <Play className='h-4 w-4' aria-hidden='true' />
                      {slot.isDone ? 'Start again' : 'Start'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
      {upNext && (
        <section
          aria-label='Up next'
          className='mt-auto min-w-0 [@media(max-height:500px)]:col-start-2 [@media(max-height:500px)]:mt-0'
        >
          <p className='text-muted-foreground text-xs font-medium'>
            {upNext.caption}
          </p>
          <p className='mt-1 line-clamp-6 text-lg leading-snug wrap-break-word [@media(max-height:600px)_and_(min-height:501px)]:line-clamp-1 [@media(max-height:640px)]:line-clamp-3'>
            {upNext.text}
          </p>
        </section>
      )}
      {meanwhile && (
        <Button
          type='button'
          variant='tertiary'
          className={join(
            'text-foreground! h-auto min-h-10 w-full min-w-0 justify-between gap-2 px-0! py-1 text-left text-sm font-normal',
            '[@media(max-height:500px)]:col-start-2',
            !upNext && 'mt-auto',
          )}
          onClick={onMeanwhile}
        >
          <span className='min-w-0 flex-1'>
            <span className='text-muted-foreground'>Meanwhile: </span>
            <span className='font-medium'>{meanwhile.title}</span>
            <span className='text-muted-foreground whitespace-nowrap'>
              {' '}
              · Step {meanwhile.stepNumber} of {meanwhile.stepCount}
            </span>
          </span>
          <ChevronRight className='h-4 w-4 shrink-0' aria-hidden='true' />
        </Button>
      )}
      {note && (
        <p className='text-muted-foreground text-xs [@media(max-height:500px)]:col-start-1'>
          {note}
        </p>
      )}
    </SwipeArea>
  );
}

export default CookTimerView;
