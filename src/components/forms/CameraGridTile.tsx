import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Camera } from 'lucide-react';

interface CameraGridTileProps {
  /** Read by a screen reader ("Take another photo"). */
  label: string;
  isDisabled?: boolean;
  onClick: () => void;
}

/** The last square of a photo grid on a touch screen: an empty box with a camera that takes the next photo. */
function CameraGridTile({
  label,
  isDisabled = false,
  onClick,
}: CameraGridTileProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      disabled={isDisabled}
      aria-label={label}
      onClick={onClick}
      className='border-border text-muted-foreground aspect-square h-auto w-full flex-col rounded-xl border-2 border-dashed p-0!'
    >
      <Camera className='size-6' aria-hidden='true' />
    </Button>
  );
}

export default CameraGridTile;
