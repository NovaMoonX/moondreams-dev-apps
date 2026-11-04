import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Camera } from 'lucide-react';

interface CameraTileProps {
  /** What the photo is of, in the person's words ("Take a photo of the receipt"). */
  title: string;
  subtitle?: string;
  isDisabled?: boolean;
  /** On a phone the tile grows into the height its section has left. */
  isFilling?: boolean;
  onClick: () => void;
}

/** The big way in on a touch screen when a photo is what the person will almost always add; a smaller chooser sits under it. */
function CameraTile({
  title,
  subtitle,
  isDisabled = false,
  isFilling = false,
  onClick,
}: CameraTileProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      disabled={isDisabled}
      onClick={onClick}
      className={join(
        'bg-accent/50 border-border h-auto min-h-44 w-full flex-col gap-3 rounded-2xl border px-4! py-8 text-center font-normal whitespace-normal',
        isFilling && 'max-sm:flex-1',
      )}
    >
      <span
        className='bg-primary text-primary-foreground grid size-16 place-items-center rounded-full'
        aria-hidden='true'
      >
        <Camera className='size-7' />
      </span>
      <span className='text-foreground text-base font-semibold'>{title}</span>
      {subtitle && (
        <span className='text-muted-foreground text-xs'>{subtitle}</span>
      )}
    </Button>
  );
}

export default CameraTile;
