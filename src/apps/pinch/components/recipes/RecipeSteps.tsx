import { useEffect, useRef, useState } from 'react';

import { Button, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Plus, Trash2, X } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MAX_RECIPE_STEPS, MAX_STEP_LENGTH } from '@apps/pinch/constants';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';

interface StepDrawerMode {
  index: number;
  isNew: boolean;
}

interface StepDrawerProps {
  steps: string[];
  mode: StepDrawerMode;
  onChange: (steps: string[]) => void;
  onRemove: (index: number) => void;
  onClose: () => void;
}

/** Writes one step without leaving the recipe; a step left blank is dropped when the drawer closes. */
function StepDrawer({
  steps,
  mode,
  onChange,
  onRemove,
  onClose,
}: StepDrawerProps) {
  const [index, setIndex] = useState(mode.index);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const step = steps[index] ?? '';
  const isBlank = step.trim() === '';

  // The drawer takes focus itself while it slides in, so the text box is focused once that settles.
  useEffect(() => {
    if (!canFocusFieldOnOpen()) return;
    const timer = window.setTimeout(() => textRef.current?.focus(), 350);
    return () => window.clearTimeout(timer);
  }, [index]);

  const removeStep = () => onChange(steps.filter((_, at) => at !== index));
  const close = () => {
    if (isBlank) removeStep();
    onClose();
  };

  return (
    <DetailSheet
      isOpen
      onClose={close}
      title={`Step ${index + 1}`}
      footer={
        <div className='space-y-2 px-4 pb-4'>
          <Button type='button' className='w-full' onClick={close}>
            Done
          </Button>
          {mode.isNew && steps.length < MAX_RECIPE_STEPS && (
            <Button
              type='button'
              variant='secondary'
              className='w-full'
              disabled={isBlank}
              onClick={() => {
                onChange([...steps, '']);
                setIndex(steps.length);
              }}
            >
              Add another
            </Button>
          )}
        </div>
      }
    >
      <div className='space-y-3'>
        <Textarea
          key={index}
          ref={textRef}
          rows={6}
          variant='outline'
          aria-label={`Step ${index + 1} text`}
          placeholder='Write this step'
          maxLength={MAX_STEP_LENGTH}
          value={step}
          onChange={(event) =>
            onChange(
              steps.map((current, at) =>
                at === index ? event.target.value : current,
              ),
            )
          }
        />
        {!mode.isNew && (
          <ActionRow
            isDestructive
            icon={<Trash2 className='h-4 w-4' />}
            label='Remove step'
            onClick={() => {
              onRemove(index);
              onClose();
            }}
          />
        )}
      </div>
    </DetailSheet>
  );
}

interface RecipeStepsProps {
  steps: string[];
  onChange: (steps: string[]) => void;
  /** Called with what a removal says and how to take it back. */
  onRemoved: (message: string, restore: () => void) => void;
}

/** The method as a column of one-line summaries. On a phone writing a step happens in a drawer; from `sm` up the step being written is the one row open in place. */
function RecipeSteps({ steps, onChange, onRemoved }: RecipeStepsProps) {
  const isPhone = useMediaQuery().isBelow('sm');
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<StepDrawerMode | null>(null);
  const latest = useRef({ steps, onChange });
  useEffect(() => {
    latest.current = { steps, onChange };
  });

  const remove = (index: number) => {
    const removed = steps[index];
    onChange(steps.filter((_, at) => at !== index));
    onRemoved(`Removed step ${index + 1}`, () =>
      latest.current.onChange([
        ...latest.current.steps.slice(0, index),
        removed,
        ...latest.current.steps.slice(index),
      ]),
    );
  };

  return (
    <div className='space-y-2'>
      {steps.map((step, index) => (
        <div key={index} className='space-y-2'>
          <div className='flex items-start gap-1'>
            <Button
              type='button'
              variant='tertiary'
              aria-expanded={isPhone ? undefined : openStep === index}
              aria-label={`Step ${index + 1}`}
              onClick={() => {
                if (isPhone) {
                  setDrawer({ index, isNew: false });
                  return;
                }
                setOpenStep((current) => (current === index ? null : index));
              }}
              className='h-auto min-w-0 flex-1 items-start justify-start gap-3 px-0! py-2 text-left'
            >
              <span className='bg-accent text-accent-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
                {index + 1}
              </span>
              <span
                className={join(
                  'line-clamp-2 min-w-0 flex-1 text-sm font-normal',
                  step.trim() === '' && 'text-muted-foreground',
                )}
              >
                {step.trim() === '' ? 'Write this step' : step}
              </span>
            </Button>
            <Button
              type='button'
              variant='tertiary'
              size='icon'
              aria-label={`Remove step ${index + 1}`}
              className='size-10 shrink-0'
              onClick={() => {
                setOpenStep(null);
                remove(index);
              }}
            >
              <X className='h-4 w-4' aria-hidden='true' />
            </Button>
          </div>
          {!isPhone && openStep === index && (
            <Textarea
              rows={3}
              variant='outline'
              autoFocus
              aria-label={`Step ${index + 1} text`}
              maxLength={MAX_STEP_LENGTH}
              value={step}
              onChange={(event) =>
                onChange(
                  steps.map((current, at) =>
                    at === index ? event.target.value : current,
                  ),
                )
              }
            />
          )}
        </div>
      ))}
      {steps.length < MAX_RECIPE_STEPS && (
        <Button
          type='button'
          variant='secondary'
          rounded='full'
          className='gap-1.5'
          onClick={() => {
            onChange([...steps, '']);
            if (isPhone) {
              setDrawer({ index: steps.length, isNew: true });
              return;
            }
            setOpenStep(steps.length);
          }}
        >
          <Plus className='h-4 w-4' aria-hidden='true' />
          Add a step
        </Button>
      )}
      {isPhone && drawer && (
        <StepDrawer
          steps={steps}
          mode={drawer}
          onChange={onChange}
          onRemove={remove}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

export default RecipeSteps;
