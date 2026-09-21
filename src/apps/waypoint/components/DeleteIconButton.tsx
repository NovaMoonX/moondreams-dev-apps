import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Trash2 } from 'lucide-react';

interface DeleteIconButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

/** The standard destructive action for modal footers: a ghost icon button, red icon/text, no red background. */
function DeleteIconButton({ onClick, disabled, label = 'Delete' }: DeleteIconButtonProps) {
  return (
    <Button
      type='button'
      variant='secondary'
      size='icon'
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className='bg-transparent text-destructive hover:bg-destructive/10'
    >
      <Trash2 className='h-4 w-4' />
    </Button>
  );
}

export default DeleteIconButton;
