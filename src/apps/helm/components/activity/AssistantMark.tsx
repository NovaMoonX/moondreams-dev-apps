import { Feather } from 'lucide-react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

interface AssistantMarkProps {
  name: string;
  /** The disc takes `card` where it sits on the pewter tint, so it stays visible. */
  isOnTint?: boolean;
  className?: string;
}

/** The assistant's mark: a 22px disc in the pewter tint with its name's first letter in the serif; a name that starts with a digit or symbol shows a feather. */
function AssistantMark({
  name,
  isOnTint = false,
  className,
}: AssistantMarkProps) {
  const initial = Array.from(name.trim())[0] ?? '';
  const isLetter = /^\p{L}$/u.test(initial);

  return (
    <span
      aria-hidden='true'
      className={join(
        'helm-serif text-secondary-foreground inline-grid size-[22px] shrink-0 place-items-center rounded-full text-xs leading-none',
        isOnTint ? 'bg-card' : 'bg-secondary',
        className,
      )}
    >
      {isLetter ? initial.toUpperCase() : <Feather className='size-3' />}
    </span>
  );
}

export default AssistantMark;
