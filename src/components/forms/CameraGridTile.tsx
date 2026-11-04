import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Camera } from 'lucide-react';

interface CameraGridTileProps {
  /** Shown under the camera ("Take another"). */
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
      onClick={onClick}
      className='border-border text-muted-foreground aspect-square h-auto w-full flex-col gap-1.5 rounded-xl border-2 border-dashed p-1! text-xs font-normal whitespace-normal'
    >
      <Camera className='size-6' aria-hidden='true' />
      {label}
    </Button>
  );
}

export default CameraGridTile;
