import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Check } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';

interface SkipQuestionButtonProps {
  /** What leaving it unanswered means, in one short line ("Nothing goes in until you set it"). */
  note: string;
  onSkip: () => void;
  /** The question is already left for later; the button then shows that state instead of offering it. */
  isSkipped?: boolean;
  label?: string;
  skippedLabel?: string;
}

/** The way to leave a question for later, set apart under its answers so it never reads as one of them. */
function SkipQuestionButton({
  note,
  onSkip,
  isSkipped = false,
  label = 'Skip for now',
  skippedLabel = 'Skipped for now',
}: SkipQuestionButtonProps) {
  return (
    <div className='space-y-3 pt-2'>
      <SectionDivider label='or' />
      <div className='space-y-1.5'>
        <Button
          type='button'
          variant='secondary'
          className='h-auto min-h-10 w-full gap-2 whitespace-normal'
          aria-pressed={isSkipped}
          onClick={onSkip}
        >
          {isSkipped && <Check className='size-4' aria-hidden='true' />}
          {isSkipped ? skippedLabel : label}
        </Button>
        <p className='text-muted-foreground text-center text-xs'>{note}</p>
      </div>
    </div>
  );
}

export default SkipQuestionButton;
