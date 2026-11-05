import { Check } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface ChoiceCardsProps<T extends string> {
  options: readonly { value: T; title: string; body: string }[];
  /** Null until the person taps one; nothing is chosen for them. */
  value: T | null;
  onChange: (value: T) => void;
}

/** Answers to one question, two side by side (an odd last one across the full width; one per row below 360px), each with a line saying what it does. */
function ChoiceCards<T extends string>({
  options,
  value,
  onChange,
}: ChoiceCardsProps<T>) {
  return (
    <div className='grid grid-cols-2 gap-2 max-[359px]:grid-cols-1'>
      {options.map((option, index) => {
        const isChosen = value === option.value;
        return (
          <Button
            key={option.value}
            type='button'
            variant='tertiary'
            aria-pressed={isChosen}
            className={join(
              index === options.length - 1 &&
                options.length % 2 === 1 &&
                'col-span-2 max-[359px]:col-span-1',
              'text-foreground! border-border h-auto w-full flex-col items-start justify-start gap-0 rounded-2xl border px-3! py-1.5! text-left font-normal whitespace-normal',
              isChosen &&
                'bg-accent! shadow-[inset_0_0_0_1.5px_var(--color-primary)]',
            )}
            onClick={() => onChange(option.value)}
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

export default ChoiceCards;
