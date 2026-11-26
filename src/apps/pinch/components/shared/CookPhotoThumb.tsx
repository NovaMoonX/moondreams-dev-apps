import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Camera } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import { useCookPhotoUrl } from '@apps/pinch/hooks/useCookPhotoUrl';
import type { Cook } from '@apps/pinch/types';
import { getCookPhotoPaths } from '@apps/pinch/utils/cooks';

interface CookPhotoThumbProps {
  cook: Pick<Cook, 'photoPath' | 'photoPaths'>;
  /** Which of the cook's photos; the cover when left out. */
  path?: string;
  className?: string;
}

/** A cook's photo (its cover unless one is named) as a picture that fills its box, or a camera while it loads or can't be read. Nothing for a cook with no photo. */
function CookPhotoThumb({ cook, path, className }: CookPhotoThumbProps) {
  const shownPath = path ?? getCookPhotoPaths(cook)[0] ?? null;
  const url = useCookPhotoUrl(shownPath);
  if (shownPath === null) return null;

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
