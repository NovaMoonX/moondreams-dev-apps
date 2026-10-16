import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check } from 'lucide-react';

interface TickMarkProps {
  className?: string;
}

/** A round tick that marks something as done, sized to the text around it; decorative, so the words beside it carry the meaning. */
function TickMark({ className }: TickMarkProps) {
  return (
    <span
      aria-hidden='true'
      className={join(
        'bg-primary text-primary-foreground inline-flex size-[1.15em] shrink-0 items-center justify-center rounded-full align-[-0.2em]',
        className,
      )}
    >
      <Check className='size-[0.75em]' strokeWidth={3.5} />
    </span>
  );
}

export default TickMark;
