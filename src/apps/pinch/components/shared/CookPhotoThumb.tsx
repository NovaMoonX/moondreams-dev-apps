import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Camera } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import { useCookPhotoUrl } from '@apps/pinch/hooks/useCookPhotoUrl';
import type { Cook } from '@apps/pinch/types';

interface CookPhotoThumbProps {
  cook: Pick<Cook, 'photoPath'>;
  className?: string;
}

/** A cook's photo as a picture that fills its box, or a camera while it loads or can't be read. Nothing for a cook with no photo. */
function CookPhotoThumb({ cook, className }: CookPhotoThumbProps) {
  const url = useCookPhotoUrl(cook);
  if (cook.photoPath == null) return null;

  return (
    <span
      className={join(
        'bg-accent text-accent-foreground relative grid shrink-0 place-items-center overflow-hidden rounded-xl',
        className,
      )}
      aria-hidden='true'
    >
      <Camera className='h-5 w-5' />
      {url && (
        <FallbackImage
          src={url}
          alt=''
          className='absolute inset-0 size-full object-cover object-center'
        />
      )}
    </span>
  );
}

export default CookPhotoThumb;
