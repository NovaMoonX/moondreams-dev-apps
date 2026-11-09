import { Check, ChevronRight } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface ChoiceCardsProps<T extends string> {
  options: readonly {
    value: T;
    title: string;
    body: string;
    /** The card opens something (a picker) rather than only choosing, so a chevron stands in for its check. */
    hasChevron?: boolean;
  }[];
  /** Null until the person taps one; nothing is chosen for them. */
  value: T | null;
  onChange: (value: T) => void;
}

/** Answers to one question, centred, two side by side (an odd last one across the full width; one per row below 360px), each with a line saying what it does. */
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
              'text-foreground! border-border relative h-auto w-full flex-col items-center justify-center gap-0 rounded-2xl border px-7! py-2! text-center font-normal whitespace-normal',
              isChosen &&
                'bg-accent! shadow-[inset_0_0_0_1.5px_var(--color-primary)]',
            )}
            onClick={() => onChange(option.value)}
          >
            <span className='text-[15px] leading-[1.125rem] font-medium'>
              {option.title}
            </span>
            <span
              className={join(
                'absolute right-2',
                option.hasChevron ? 'top-1/2 -translate-y-1/2' : 'top-2',
              )}
            >
              {option.hasChevron ? (
                <ChevronRight
                  className={join(
                    'size-5 shrink-0',
                    isChosen ? 'text-primary' : 'text-muted-foreground',
                  )}
                  aria-hidden='true'
                />
              ) : (
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
              )}
            </span>
            <span className='text-muted-foreground mt-0.5 block text-[13px] leading-[1.125rem]'>
              {option.body}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

export default ChoiceCards;
