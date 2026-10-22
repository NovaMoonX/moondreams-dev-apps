import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Volume2 } from 'lucide-react';

import ShowMoreButton from '@/components/ShowMoreButton';
import type { RecipeNote } from '@apps/pinch/types';

const SHOWN_TIPS = 2;
const LONG_TIP_CHARS = 110;

interface CookStepTipsProps {
  tips: RecipeNote[];
  /** Reads the tips aloud; null where the browser cannot speak. */
  onRead: (() => void) | null;
}

/** The tips written for the step on screen, under its instruction and timers: advice for making the step, meant to be read as the step is. A step with more than two, or a long one, folds the rest behind one "Show more"; the speaker reads everything either way. */
function CookStepTips({ tips, onRead }: CookStepTipsProps) {
  const [isOpen, setIsOpen] = useState(false);
  if (tips.length === 0) return null;

  const hidden = Math.max(0, tips.length - SHOWN_TIPS);
  const isFolded = hidden > 0 || tips.some((tip) => (tip.text ?? '').length > LONG_TIP_CHARS);
  const shown = isOpen ? tips : tips.slice(0, SHOWN_TIPS);

  return (
    <section
      data-cook='step-tips'
      aria-label={tips.length === 1 ? 'Tip for this step' : 'Tips for this step'}
      className='bg-accent/60 border-border mt-6 flex items-start gap-1 rounded-2xl border py-2 pr-1.5 pl-3 [@media(max-height:640px)]:mt-4'
    >
      <div className='min-w-0 flex-1 py-1'>
        <ul className='space-y-2'>
          {shown.map((tip) => (
            <li key={tip.id} className='flex gap-2 text-base wrap-break-word'>
              <span aria-hidden='true' className='w-5 shrink-0 text-center'>
                💡
              </span>
              <span
                className={join(
                  'min-w-0 flex-1 whitespace-pre-wrap',
                  !isOpen && 'line-clamp-3',
                )}
              >
                {tip.text}
              </span>
            </li>
          ))}
        </ul>
        {isFolded && (
          <ShowMoreButton isOpen={isOpen} onClick={() => setIsOpen((open) => !open)}>
            {isOpen ? 'Show fewer' : hidden > 0 ? `Show ${hidden} more` : 'Show more'}
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
