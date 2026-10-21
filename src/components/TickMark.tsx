import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check } from 'lucide-react';

interface TickMarkProps {
  /** `soft` is a tinted circle with a hairline, for a mark that repeats down a list; `ink`, the default, is solid, for a single done row. */
  variant?: 'ink' | 'soft';
  className?: string;
}

/** A round tick that marks something as done, sized to the text around it; decorative, so the words beside it carry the meaning. */
function TickMark({ variant = 'ink', className }: TickMarkProps) {
  return (
    <span
      aria-hidden='true'
      className={join(
        'inline-flex size-[1.15em] shrink-0 items-center justify-center rounded-full align-[-0.2em]',
        variant === 'ink'
          ? 'bg-primary text-primary-foreground'
          : 'bg-accent text-accent-foreground border-accent-foreground/30 border',
        className,
      )}
    >
      <Check className='size-[0.75em]' strokeWidth={3.5} />
    </span>
  );
}

export default TickMark;
