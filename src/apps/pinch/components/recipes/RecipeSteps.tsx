import { useState } from 'react';

import { Button, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Plus, Trash2 } from 'lucide-react';

import { MAX_RECIPE_STEPS, MAX_STEP_LENGTH } from '@apps/pinch/constants';

interface RecipeStepsProps {
  steps: string[];
  onChange: (steps: string[]) => void;
}

/** The method as a column of one-line summaries; the step being written is the only one open. */
function RecipeSteps({ steps, onChange }: RecipeStepsProps) {
  const [openStep, setOpenStep] = useState<number | null>(null);

  return (
    <div className='space-y-2'>
      {steps.map((step, index) => (
        <div key={index} className='space-y-2'>
          <div className='flex items-start gap-1'>
            <Button
              type='button'
              variant='tertiary'
              aria-expanded={openStep === index}
              aria-label={`Step ${index + 1}`}
              onClick={() =>
                setOpenStep((current) => (current === index ? null : index))
              }
              className='h-auto min-h-12 min-w-0 flex-1 items-start justify-start gap-3 px-0! py-2 text-left'
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
                onChange(steps.filter((_, at) => at !== index));
              }}
            >
              <Trash2 className='h-4 w-4' aria-hidden='true' />
            </Button>
          </div>
          {openStep === index && (
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
            setOpenStep(steps.length);
          }}
        >
          <Plus className='h-4 w-4' aria-hidden='true' />
          Add a step
        </Button>
      )}
    </div>
  );
}

export default RecipeSteps;
