import { Check } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { HELD_WORDS } from '@apps/runway/constants';
import type { HeldChoice } from '@apps/runway/engine/endings';

interface HeldChoiceListProps {
  value: HeldChoice | null;
  onChange: (choice: HeldChoice) => void;
  freeBody: string;
  keepBody: string;
}

/** The two answers for the money a stopping item holds, side by side, nothing chosen until the person taps one. */
function HeldChoiceList({
  value,
  onChange,
  freeBody,
  keepBody,
}: HeldChoiceListProps) {
  const options: { choice: HeldChoice; title: string; body: string }[] = [
    { choice: 'free', title: HELD_WORDS.freeTitle, body: freeBody },
    { choice: 'keep', title: HELD_WORDS.keepTitle, body: keepBody },
  ];
  return (
    <div className='grid grid-cols-2 gap-2'>
      {options.map((option) => {
        const isChosen = value === option.choice;
        return (
          <Button
            key={option.choice}
            type='button'
            variant='tertiary'
            aria-pressed={isChosen}
            className={join(
              'text-foreground! border-border h-auto w-full flex-col items-start justify-start gap-0 rounded-2xl border px-3! py-1.5! text-left font-normal whitespace-normal',
              isChosen &&
                'bg-accent! shadow-[inset_0_0_0_1.5px_var(--color-primary)]',
            )}
            onClick={() => onChange(option.choice)}
          >
            <span className='flex w-full items-start justify-between gap-2'>
              <span className='text-[15px] leading-[1.125rem] font-medium'>
                {option.title}
              </span>
              <span
                aria-hidden='true'
                className={join(
                  'grid size-5 shrink-0 place-items-center rounded-full border',
                  isChosen
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border',
                )}
              >
                {isChosen && <Check className='size-3.5' />}
              </span>
            </span>
            <span className='text-muted-foreground block text-[13px] leading-[1.125rem]'>
              {option.body}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

export default HeldChoiceList;
