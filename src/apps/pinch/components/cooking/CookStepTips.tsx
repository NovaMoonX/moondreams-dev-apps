import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Volume2 } from 'lucide-react';

import ShowMoreButton from '@/components/ShowMoreButton';
import type { RecipeNote } from '@apps/pinch/types';

const SHOWN_TIPS = 2;

interface CookStepTipsProps {
  tips: RecipeNote[];
  /** Reads the tips aloud; null where the browser cannot speak. */
  onRead: (() => void) | null;
}

/** The tips written for the step on screen, right under its instruction: advice for making the step, meant to be read as the step is. A step with more than two folds the rest behind "Show N more". */
function CookStepTips({ tips, onRead }: CookStepTipsProps) {
  const [isOpen, setIsOpen] = useState(false);
  if (tips.length === 0) return null;

  const hidden = tips.length - SHOWN_TIPS;
  const shown = isOpen || hidden <= 1 ? tips : tips.slice(0, SHOWN_TIPS);

  return (
    <section
      data-cook='step-tips'
      aria-label={tips.length === 1 ? 'Tip for this step' : 'Tips for this step'}
      className='bg-accent/60 border-border mt-4 flex items-start gap-1 rounded-2xl border py-2 pr-1.5 pl-3 [@media(max-height:640px)]:mt-3'
    >
      <div className='min-w-0 flex-1 py-1'>
        <ul className='space-y-2'>
          {shown.map((tip) => (
            <li key={tip.id} className='flex gap-2 text-base wrap-break-word'>
              <span aria-hidden='true' className='w-5 shrink-0 text-center'>
                💡
              </span>
              <span className='min-w-0 flex-1 whitespace-pre-wrap'>
                {tip.text}
              </span>
            </li>
          ))}
        </ul>
        {hidden > 1 && (
          <ShowMoreButton isOpen={isOpen} onClick={() => setIsOpen((open) => !open)}>
            {isOpen ? 'Show fewer' : `Show ${hidden} more`}
          </ShowMoreButton>
        )}
      </div>
      {onRead && (
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          className='size-10 shrink-0'
          aria-label={tips.length === 1 ? 'Read the tip aloud' : 'Read the tips aloud'}
          onClick={onRead}
        >
          <Volume2 className='h-4 w-4' aria-hidden='true' />
        </Button>
      )}
    </section>
  );
}

export default CookStepTips;
