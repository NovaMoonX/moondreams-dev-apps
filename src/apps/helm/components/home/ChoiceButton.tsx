import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check } from 'lucide-react';

import { HELM_COPY } from '@apps/helm/constants';

// A 28px button reaches 40px tall through its pseudo-element, which the 12px gaps leave clear.
export const QUIET_CLASS =
  "relative after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']";

interface ChoiceButtonProps {
  label: string;
  detail?: string | null;
  isDisabled: boolean;
  onClick: () => void;
  /** Set on a choice that can be ticked among others; it then says whether it is. */
  isSelected?: boolean;
}

/** One answer as a tall choice: its label, what tells it apart under it, and a tick when it is one of several. */
function ChoiceButton({
  label,
  detail = null,
  isDisabled,
  onClick,
  isSelected,
}: ChoiceButtonProps) {
  return (
    <Button
      type='button'
      variant='secondary'
      aria-label={HELM_COPY.questionOptionAria(label, detail)}
      aria-pressed={isSelected}
      disabled={isDisabled}
      className={join(
        'h-auto min-h-[52px] w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left',
        isSelected && 'border-primary border',
      )}
      onClick={onClick}
    >
      <span className='flex min-w-0 flex-col items-start'>
        <span className='text-[15px] leading-[21px] break-words'>{label}</span>
        {detail && (
          <span className='text-muted-foreground text-[13px] break-words'>
            {detail}
          </span>
        )}
      </span>
      {isSelected !== undefined && (
        <Check
          className={join('size-4 shrink-0', !isSelected && 'invisible')}
          aria-hidden='true'
        />
      )}
    </Button>
  );
}

export default ChoiceButton;
