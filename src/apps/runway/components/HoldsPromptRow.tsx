import { useState } from 'react';
import { ChevronRight, Landmark } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { HOLDS_PROMPT_WORDS } from '@apps/runway/constants';
import { useHoldsPrompt } from '@apps/runway/hooks/useHoldsPrompt';
import HeldInPromptScreen from '@apps/runway/screens/link/HeldInPromptScreen';

/** Home's quiet question after a bank is linked: where the goals and envelopes are kept. Gone once every one has an account, or after "Ask me later" for a few days and "Don't ask again" for good. */
function HoldsPromptRow() {
  const { isOnHome } = useHoldsPrompt();
  const [isOpen, setIsOpen] = useState(false);

  if (!isOnHome && !isOpen) return null;
  return (
    <>
      {isOnHome && (
        <Button
          type='button'
          variant='tertiary'
          className='bg-card border-border hover:bg-muted/60 h-auto min-h-11 w-full items-center justify-start gap-3 rounded-2xl border px-3! py-1.5 text-left font-normal whitespace-normal'
          onClick={() => setIsOpen(true)}
        >
          <Landmark
            className='text-muted-foreground h-5 w-5 shrink-0'
            aria-hidden='true'
          />
          <span className='min-w-0 flex-1'>
            <span className='text-foreground block text-sm font-medium'>
              {HOLDS_PROMPT_WORDS.title}
            </span>
            <span className='text-muted-foreground block text-[13px]'>
              {HOLDS_PROMPT_WORDS.subtitle}
            </span>
          </span>
          <ChevronRight
            className='text-muted-foreground h-4 w-4 shrink-0'
            aria-hidden='true'
          />
        </Button>
      )}
      {isOpen && <HeldInPromptScreen onClose={() => setIsOpen(false)} />}
    </>
  );
}

export default HoldsPromptRow;
