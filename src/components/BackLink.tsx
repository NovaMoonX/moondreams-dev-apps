import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from 'lucide-react';

import { useBackStep } from '@/hooks/useBackHistory';

interface BackLinkProps {
  onBack: () => void;
  /** Names where it goes ("All the boxes", "Back to results"). */
  label?: string;
}

/** The "‹ Back" that opens a view swapped into a drawer or sheet: a quiet hairline chip with a 40px tap area. The phone's back gesture and Escape take the same step while it shows. */
function BackLink({ onBack, label = 'Back' }: BackLinkProps) {
  useBackStep(true, onBack);

  return (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      rounded='full'
      className="text-foreground! relative h-7! min-h-0! w-fit max-w-full shrink-0 gap-1 py-0! pr-3! pl-1.5! align-top before:absolute before:-inset-1.5 before:content-['']"
      onClick={onBack}
    >
      <ChevronLeft className='h-4 w-4 shrink-0' aria-hidden='true' />
      <span className='truncate'>{label}</span>
    </Button>
  );
}

export default BackLink;
