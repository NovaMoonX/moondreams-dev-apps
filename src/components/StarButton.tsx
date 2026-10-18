import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Star } from 'lucide-react';

interface StarButtonProps {
  isOn: boolean;
  /** What the star is for ("Favorite Adobo and rice"); whether it is on is `aria-pressed`, so the label never flips. */
  label: string;
  onClick: () => void;
  /** The filled star's colour, a `text-*` class. */
  onClassName?: string;
  className?: string;
}

/** A 40px icon-only star that stays one quiet button and fills its icon when on. */
function StarButton({
  isOn,
  label,
  onClick,
  onClassName = 'text-primary',
  className,
}: StarButtonProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      size='icon'
      aria-label={label}
      title={label}
      aria-pressed={isOn}
      onClick={onClick}
      className={join('size-10 min-w-10 shrink-0 p-0', className)}
    >
      <Star
        className={join(
          'h-5 w-5',
          isOn && 'fill-current',
          isOn ? onClassName : 'text-muted-foreground',
        )}
        aria-hidden='true'
      />
    </Button>
  );
}

export default StarButton;
