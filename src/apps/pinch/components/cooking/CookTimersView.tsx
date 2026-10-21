import { useEffect, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  BellRing,
  ChevronRight,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';

import ActionChips, { type ActionChip } from '@/components/ActionChips';
import Field, { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import { PillGroup } from '@/components/PillGroup';
import SectionHeader from '@/components/SectionHeader';
import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { formatClock } from '@/utils/durationUtils';
import {
  getRemainingMs,
  type CookTimer,
} from '@apps/pinch/hooks/useCookTimers';
import {
  KITCHEN_TIMER_MINUTES,
  MAX_KITCHEN_TIMER_NAME,
  TIMER_EXTEND_MINUTES,
} from '@apps/pinch/constants';
import {
  canExtendTimer,
  type KitchenTimerDraft,
} from '@apps/pinch/utils/cooks';

const TICK_MS = 250;
const MINUTE_MS = 60_000;
const OTHER_LENGTH = 'OTHER';
const LENGTH_OPTIONS = [
  ...KITCHEN_TIMER_MINUTES.map((minutes) => ({
    value: String(minutes),
    label: `${minutes} min`,
  })),
  { value: OTHER_LENGTH, label: 'Other' },
];

interface CookTimersViewProps {
  /** Finished ones first, then in the order they started. */
  timers: CookTimer[];
  draft: KitchenTimerDraft;
  /** Every live slot is taken: a Time's up can't start again, so it offers no more time. */
  isFull: boolean;
  onDraftChange: (draft: KitchenTimerDraft) => void;
  onTick: () => void;
  onFocus: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onExtend: (id: string, ms: number) => void;
  /** Reset a running or paused timer, Dismiss a finished one. */
  onEnd: (id: string) => void;
}

/** Every timer of the session on one screen, each with its own controls, under the form that sets a new one for anything no step mentions. The Start for the form is the pinned footer's primary. */
function CookTimersView({
  timers,
  draft,
  isFull,
  onDraftChange,
  onTick,
  onFocus,
  onPause,
  onResume,
  onExtend,
  onEnd,
}: CookTimersViewProps) {
  const hasRunning = timers.some((timer) => timer.status === 'running');
  const [now, setNow] = useState(() => Date.now());

  useOnTabReturn(() => setNow(Date.now()));

  useEffect(() => {
    if (!hasRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
      onTick();
    }, TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [hasRunning, onTick]);

  const getChangeActions = (timer: CookTimer): ActionChip[] => {
    const title = `the ${timer.label} timer: ${timer.stepName}`;
    const stateAction: ActionChip[] =
      timer.status === 'running'
        ? [
            {
              key: 'pause',
              icon: <Pause className='h-4 w-4' />,
              label: 'Pause',
              description: `Pause ${title}`,
              onClick: () => onPause(timer.id),
            },
          ]
        : timer.status === 'paused'
          ? [
              {
                key: 'resume',
                icon: <Play className='h-4 w-4' />,
                label: 'Resume',
                description: `Resume ${title}`,
                onClick: () => onResume(timer.id),
              },
            ]
          : [];
    const extendActions = (
      timer.status === 'done' && isFull ? [] : [...TIMER_EXTEND_MINUTES]
    ).map((minutes): ActionChip => ({
      key: `add-${minutes}`,
      icon: <Plus className='h-4 w-4' />,
      label: `${minutes} min`,
      description: `Add ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} to ${title}`,
      isDisabled: !canExtendTimer(
        getRemainingMs(timer, now),
        minutes * MINUTE_MS,
      ),
      onClick: () => onExtend(timer.id, minutes * MINUTE_MS),
    }));
    return [...stateAction, ...extendActions];
  };

  const getEndAction = (timer: CookTimer): ActionChip => ({
    key: 'end',
    icon:
      timer.status === 'done' ? (
        <X className='h-4 w-4' />
      ) : (
        <RotateCcw className='h-4 w-4' />
      ),
    label: timer.status === 'done' ? 'Dismiss' : 'Reset',
    description: `${timer.status === 'done' ? 'Dismiss' : 'Reset'} the ${timer.label} timer: ${timer.stepName}`,
    isQuiet: true,
    onClick: () => onEnd(timer.id),
  });

  return (
    <div className='mx-auto flex w-full max-w-xl flex-1 flex-col gap-6'>
      <section
        aria-label='New timer'
        className='bg-muted/50 border-border space-y-4 rounded-2xl border p-4'
      >
        <Field label='Name' isCompact>
          {() => (
            <Input
              variant='outline'
              className={COMPACT_INPUT_CLASS}
              placeholder='Pasta water'
              maxLength={MAX_KITCHEN_TIMER_NAME}
              value={draft.name}
              onChange={(event) =>
                onDraftChange({ ...draft, name: event.target.value })
              }
            />
          )}
        </Field>
        <div className='space-y-1'>
          <p className='text-muted-foreground text-xs font-medium'>Length</p>
          <PillGroup
            label='Length'
            options={LENGTH_OPTIONS}
            value={draft.length}
            onChange={(length) => onDraftChange({ ...draft, length })}
          />
        </div>
        {draft.length === OTHER_LENGTH && (
          <Field label='Minutes' isCompact>
            {() => (
              <div className='relative'>
                <Input
                  type='number'
                  inputMode='numeric'
                  min={1}
                  step={1}
                  max={1440}
                  variant='outline'
                  aria-label='Length in minutes'
                  className={join(
                    COMPACT_INPUT_CLASS,
                    '[appearance:textfield] pr-12! [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                  )}
                  value={draft.otherMinutes}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      otherMinutes: event.target.value,
                    })
                  }
                />
                <span
                  className='text-muted-foreground pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm'
                  aria-hidden='true'
                >
                  min
                </span>
              </div>
            )}
          </Field>
        )}
      </section>
      <section aria-label='Your timers' className='min-w-0'>
        <SectionHeader title='Your timers' />
        {timers.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            Nothing is running. A timer you start shows up here.
          </p>
        ) : (
          <ul className='border-border divide-border divide-y rounded-2xl border'>
            {timers.map((timer) => {
              const isDone = timer.status === 'done';
              const isPaused = timer.status === 'paused';
              const meta = [
                timer.recipeId === null
                  ? null
                  : (timer.recipeTitle ?? `Step ${timer.stepNumber}`),
                timer.label,
                isPaused ? 'Paused' : null,
              ].filter((part) => part !== null);
              return (
                <li key={timer.id} className='space-y-1 px-4 pt-1 pb-3'>
                  <Button
                    type='button'
                    variant='tertiary'
                    className='text-foreground! h-auto min-h-12 w-full min-w-0 justify-between gap-3 px-0! py-1 text-left font-normal'
                    aria-label={`Show the ${timer.label} timer: ${timer.stepName}${isDone ? ", time's up" : isPaused ? ', paused' : ''}`}
                    onClick={() => onFocus(timer.id)}
                  >
                    <span className='min-w-0 flex-1'>
                      <span className='block text-base font-medium wrap-break-word'>
                        {timer.stepName}
                      </span>
                      <span className='text-muted-foreground block text-xs wrap-break-word'>
                        {meta.join(' · ')}
                      </span>
                    </span>
                    <span
                      className={join(
                        'flex shrink-0 items-center gap-1.5 text-xl font-semibold whitespace-nowrap tabular-nums',
                        isPaused && 'text-muted-foreground',
                      )}
                    >
                      {isDone && (
                        <BellRing className='h-5 w-5' aria-hidden='true' />
                      )}
                      {isDone
                        ? "Time's up"
                        : formatClock(getRemainingMs(timer, now))}
                      <ChevronRight
                        className='text-muted-foreground h-4 w-4'
                        aria-hidden='true'
                      />
                    </span>
                  </Button>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <ActionChips
                      label={`${timer.stepName} timer`}
                      actions={getChangeActions(timer)}
                    />
                    <ActionChips
                      isIconOnly
                      label={`End ${timer.stepName} timer`}
                      actions={[getEndAction(timer)]}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default CookTimersView;
