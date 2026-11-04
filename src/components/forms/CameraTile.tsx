import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Camera } from 'lucide-react';

interface CameraTileProps {
  /** What the photo is of, in the person's words ("Take a photo of the receipt"). */
  title: string;
  isDisabled?: boolean;
  onClick: () => void;
}

/** The big way in on a touch screen when a photo is what the person will almost always add; a smaller chooser sits under it. */
function CameraTile({ title, isDisabled = false, onClick }: CameraTileProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      disabled={isDisabled}
      onClick={onClick}
      className='bg-accent/50 border-border h-auto min-h-44 w-full flex-col gap-3 rounded-2xl border px-4! py-8 text-center font-normal whitespace-normal [@media(max-height:640px)]:min-h-28 [@media(max-height:640px)]:gap-2 [@media(max-height:640px)]:py-4 [@media(min-height:780px)]:min-h-64'
    >
      <span
        className='bg-primary text-primary-foreground grid size-16 place-items-center rounded-full [@media(max-height:640px)]:size-12'
        aria-hidden='true'
      >
        <Camera className='size-7 [@media(max-height:640px)]:size-6' />
      </span>
      <span className='text-foreground text-base font-semibold'>{title}</span>
    </Button>
  );
}

export default CameraTile;
