import { Check } from 'lucide-react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import { SETUP_WORDS } from '@apps/runway/constants';

export interface SetupProgress {
  income: number;
  bill: number;
  spending: number;
}

const COUNTS: Record<keyof SetupProgress, readonly [string, string]> = {
  income: ['income source', 'income sources'],
  bill: ['bill', 'bills'],
  spending: ['envelope or goal', 'envelopes and goals'],
};

/** The three things a plan needs, each done, next or later, so a person always sees where they are. */
function SetupSteps({ progress }: { progress: SetupProgress }) {
  const keys = SETUP_WORDS.steps.map((step) => step.key);
  const next = keys.find((key) => progress[key] === 0) ?? null;

  return (
    <ol className='space-y-3'>
      {SETUP_WORDS.steps.map((step, index) => {
        const count = progress[step.key];
        const isDone = count > 0;
        const isNext = step.key === next;
        return (
          <li key={step.key} className='flex items-center gap-3'>
            <span
              aria-hidden='true'
              className={join(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                isDone && 'bg-primary text-primary-foreground',
                isNext && 'border-primary text-primary border-2',
                !isDone &&
                  !isNext &&
                  'border-border text-muted-foreground border',
              )}
            >
              {isDone ? <Check className='h-4 w-4' /> : index + 1}
            </span>
            <span className='min-w-0'>
              <span
                className={join(
                  'block text-base',
                  isNext ? 'font-semibold' : 'font-medium',
                  !isDone && !isNext && 'text-muted-foreground',
                )}
              >
                {step.title}
              </span>
              {(isDone || isNext) && (
                <span className='text-muted-foreground block text-sm'>
                  {isDone
                    ? `${count} ${COUNTS[step.key][count === 1 ? 0 : 1]}`
                    : step.hint}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default SetupSteps;
