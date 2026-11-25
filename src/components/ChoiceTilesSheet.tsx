import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';

export interface ChoiceTile {
  key: string;
  icon: ReactNode;
  label: string;
  subtitle?: string;
  onPick: () => void;
}

interface ChoiceTilesSheetProps {
  title: string;
  choices: readonly [ChoiceTile, ChoiceTile];
  onClose: () => void;
}

/** A small drawer that asks which of two ways to go, as two equal square tiles (take a photo or pick one; a new record or an existing one). */
function ChoiceTilesSheet({ title, choices, onClose }: ChoiceTilesSheetProps) {
  return (
    <FormSheet isOpen isDrawerWhenShort title={title} onClose={onClose}>
      <div className='grid grid-cols-2 gap-3 pb-2'>
        {choices.map((choice) => (
          <Button
            key={choice.key}
            type='button'
            variant='tertiary'
            onClick={choice.onPick}
            className='bg-accent/50 border-border h-auto min-h-36 w-full flex-col justify-start gap-3 rounded-2xl border px-3! py-6 text-center font-normal whitespace-normal'
          >
            <span
              className='bg-primary text-primary-foreground grid size-14 place-items-center rounded-full [&_svg]:size-6'
              aria-hidden='true'
            >
              {choice.icon}
            </span>
            <span className='min-h-12'>
              <span className='text-foreground block text-base leading-6 font-semibold'>
                {choice.label}
              </span>
              {choice.subtitle && (
                <span className='text-muted-foreground block text-[13px] leading-4'>
                  {choice.subtitle}
                </span>
              )}
            </span>
          </Button>
        ))}
      </div>
    </FormSheet>
  );
}

export default ChoiceTilesSheet;
