import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface ChoiceCardProps {
  label: string;
  meaning: string;
  isChosen: boolean;
  onPick: () => void;
  isDisabled?: boolean;
}

/** One answer of a pick-one question whose choices each need a line of meaning; its parent is the `radiogroup`. */
function ChoiceCard({
  label,
  meaning,
  isChosen,
  onPick,
  isDisabled = false,
}: ChoiceCardProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      role='radio'
      aria-checked={isChosen}
      disabled={isDisabled}
      className={join(
        'text-foreground! border-border h-auto w-full flex-col items-start justify-start gap-0 rounded-2xl border px-3! py-2! text-left font-normal whitespace-normal',
        isChosen &&
          'bg-accent! shadow-[inset_0_0_0_1.5px_var(--color-primary)]',
      )}
      onClick={onPick}
    >
      <span className='text-[15px] leading-[1.125rem] font-medium'>
        {label}
      </span>
      <span className='text-muted-foreground block text-[13px] leading-[1.125rem]'>
        {meaning}
      </span>
    </Button>
  );
}

export default ChoiceCard;
