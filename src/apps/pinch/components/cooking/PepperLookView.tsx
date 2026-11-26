import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { AssistantOrbDrop } from '@/components/AssistantOrb';
import BackLink from '@/components/BackLink';
import PepperFace from '@apps/pinch/components/cooking/PepperFace';
import { PEPPER_LOOKS } from '@apps/pinch/constants';
import type { PepperLook } from '@apps/pinch/types';

/** One look as the orb draws it, waiting: a face, or the plain orb's drop. Sized by its `className`. */
export function PepperLookMark({
  look,
  className,
}: {
  look: PepperLook;
  className: string;
}) {
  return (
    <span
      aria-hidden='true'
      data-state='waiting'
      className={join('block shrink-0 *:size-full', className)}
    >
      {look === 'ORB' ? <AssistantOrbDrop /> : <PepperFace look={look} />}
    </span>
  );
}

interface PepperLookViewProps {
  look: PepperLook;
  onChoose: (look: PepperLook) => void;
  onBack: () => void;
}

/** The voice sheet's view of every look Pepper can have, each shown as it waits: a tap saves it and stays here. */
function PepperLookView({ look, onChoose, onBack }: PepperLookViewProps) {
  return (
    <div className='space-y-3'>
      <BackLink onBack={onBack} label='Back to voice control' />
      <div>
        <h3 className='text-sm font-medium'>Pepper’s look</h3>
        <p className='text-muted-foreground text-xs'>
          How Pepper shows in the orb while you cook.
        </p>
      </div>
      <ul className='grid grid-cols-3 gap-2'>
        {PEPPER_LOOKS.map((choice) => {
          const isChosen = choice.value === look;
          return (
            <li key={choice.value} className='flex'>
              <Button
                type='button'
                variant='tertiary'
                aria-pressed={isChosen}
                className={join(
                  'h-auto! min-h-10 w-full flex-col gap-2 rounded-xl px-1! py-3! text-xs font-medium whitespace-normal',
                  isChosen
                    ? 'bg-[var(--pinch-drizzle-soft)]! shadow-[inset_0_0_0_1.5px_var(--pinch-drizzle)]'
                    : 'border-border border',
                )}
                onClick={() => onChoose(choice.value)}
              >
                <PepperLookMark look={choice.value} className='size-14' />
                <span className='text-center text-pretty'>{choice.label}</span>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default PepperLookView;
