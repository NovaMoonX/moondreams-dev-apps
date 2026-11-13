import { Feather } from 'lucide-react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

interface AssistantMarkProps {
  name: string;
  /** The disc takes `card` where it sits on the pewter tint, so it stays visible. */
  isOnTint?: boolean;
  /** Beside the assistant's name as a title, rather than beside a reply. */
  isLarge?: boolean;
  className?: string;
}

/** The assistant's mark: a 22px disc (28px beside a title) in the pewter tint with its name's first letter in the serif; a name that starts with a digit or symbol shows a feather. */
function AssistantMark({
  name,
  isOnTint = false,
  isLarge = false,
  className,
}: AssistantMarkProps) {
  const initial = Array.from(name.trim())[0] ?? '';
  const isLetter = /^\p{L}$/u.test(initial);

  return (
    <span
      aria-hidden='true'
      className={join(
        'helm-serif text-secondary-foreground inline-grid shrink-0 place-items-center rounded-full leading-none',
        isLarge ? 'size-7 text-sm' : 'size-[22px] text-xs',
        isOnTint ? 'bg-card' : 'bg-secondary',
        className,
      )}
    >
      {isLetter ? initial.toUpperCase() : <Feather className='size-3' />}
    </span>
  );
}

export default AssistantMark;
