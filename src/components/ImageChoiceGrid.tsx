import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, LoaderCircle } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';

export interface ImageChoice {
  key: string;
  src: string;
  label: string;
  isUnavailable?: boolean;
}

interface ImageChoiceGridProps {
  label: string;
  choices: ImageChoice[];
  selectedKey: string | null;
  checkingKey?: string | null;
  fallback: ReactNode;
  /** Extra classes for every tile, for a screen that has to reshape them (a shorter tile on a short landscape phone). */
  tileClassName?: string;
  onPick: (key: string) => void;
}

/** The selected border is an overlay, not a focus ring: the app strips the ring from a control the pointer just tapped. */
function ImageChoiceGrid({
  label,
  choices,
  selectedKey,
  checkingKey = null,
  fallback,
  tileClassName,
  onPick,
}: ImageChoiceGridProps) {
  return (
    <div role='group' aria-label={label} className='grid grid-cols-3 gap-2'>
      {choices.map((choice) => {
        const isSelected = choice.key === selectedKey;
        const isChecking = choice.key === checkingKey;
        return (
          <Button
            key={choice.key}
            type='button'
            variant='tertiary'
            size='stripped'
            aria-pressed={isSelected}
            aria-label={
              choice.isUnavailable
                ? `${choice.label}, can’t be reached`
                : choice.label
            }
            disabled={choice.isUnavailable}
            onClick={() => onPick(choice.key)}
            className={join(
              'bg-accent relative block aspect-4/3 h-auto w-full overflow-hidden rounded-xl border p-0 transition-none',
              isSelected ? 'border-primary' : 'border-border',
              choice.isUnavailable && 'opacity-40',
              tileClassName,
            )}
          >
            <FallbackImage
              src={choice.src}
              alt=''
              className='size-full object-cover'
              fallback={
                <span
                  className='text-accent-foreground grid size-full place-items-center text-3xl'
                  aria-hidden='true'
                >
                  {fallback}
                </span>
              }
            />
            {isSelected && (
              <span
                className='border-primary pointer-events-none absolute inset-0 rounded-[inherit] border-[3px]'
                aria-hidden='true'
              >
                <span className='bg-primary text-primary-foreground absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full shadow-sm'>
                  <Check className='size-4' strokeWidth={3} />
                </span>
              </span>
            )}
            {isChecking && (
              <span
                className='bg-background/70 absolute inset-0 grid place-items-center'
                aria-hidden='true'
              >
                <LoaderCircle className='size-6 animate-spin' />
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}

export default ImageChoiceGrid;
