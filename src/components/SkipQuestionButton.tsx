import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Check } from 'lucide-react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import SectionDivider from '@/components/SectionDivider';

interface SkipQuestionButtonProps {
  /** What leaving it unanswered means, in one short line ("Nothing goes in until you set it"). */
  note: string;
  onSkip: () => void;
  /** The question is already left for later; the button then shows that state instead of offering it. */
  isSkipped?: boolean;
  /** What to do from the skipped state; falls back to `note`. */
  skippedNote?: string;
  label?: string;
  skippedLabel?: string;
}

/** The way to leave a question for later, set apart under its answers so it never reads as one of them. */
function SkipQuestionButton({
  note,
  onSkip,
  isSkipped = false,
  skippedNote,
  label = 'Skip for now',
  skippedLabel = 'Skipped for now',
}: SkipQuestionButtonProps) {
  return (
    <div className='space-y-3 pt-2'>
      <SectionDivider label='or' />
      <div className='space-y-1.5'>
        <Button
          type='button'
          variant='outline'
          className={join(
            'h-auto min-h-10 w-full gap-2 whitespace-normal',
            isSkipped && 'border-primary bg-accent text-accent-foreground',
          )}
          aria-pressed={isSkipped}
          onClick={onSkip}
        >
          {isSkipped && <Check className='size-4' aria-hidden='true' />}
          {isSkipped ? skippedLabel : label}
        </Button>
        <p className='text-muted-foreground text-center text-xs'>
          {isSkipped ? (skippedNote ?? note) : note}
        </p>
      </div>
    </div>
  );
}

export default SkipQuestionButton;
