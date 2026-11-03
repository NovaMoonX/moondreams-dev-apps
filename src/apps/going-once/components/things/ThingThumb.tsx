import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Camera } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import { useItemPhotoUrls } from '@apps/going-once/queries/photoUrlQueries';
import type { Item } from '@apps/going-once/types';

interface ThingThumbProps {
  /** The thing whose cover is drawn; a thing that is gone shows the camera. */
  item: Pick<Item, 'photos'> | null;
  className?: string;
}

/** A thing's cover as a small rounded square, with a camera while it has none or it can't be read. */
function ThingThumb({ item, className }: ThingThumbProps) {
  const [cover] = useItemPhotoUrls(
    item === null ? [] : item.photos.slice(0, 1),
  );

  return (
    <span
      className={join(
        'bg-muted text-muted-foreground grid shrink-0 place-items-center overflow-hidden rounded-lg',
        className ?? 'size-12',
      )}
    >
      {cover?.url ? (
        <FallbackImage
          src={cover.url}
          alt=''
          className='size-full object-cover'
          fallback={<Camera className='size-5' aria-hidden='true' />}
        />
      ) : (
        <Camera className='size-5' aria-hidden='true' />
      )}
    </span>
  );
}

export default ThingThumb;
