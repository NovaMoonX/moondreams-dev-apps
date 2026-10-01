import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Check } from 'lucide-react';

interface DismissIconButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

/** A ghost icon button for acknowledging/dismissing a single item — a checkmark, not a trash can. */
function DismissIconButton({ onClick, disabled, label = 'Dismiss' }: DismissIconButtonProps) {
  return (
    <Button
      type='button'
      variant='secondary'
      size='icon'
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className='text-muted-foreground hover:bg-accent bg-transparent'
    >
      <Check className='h-4 w-4' />
    </Button>
  );
}

export default DismissIconButton;
