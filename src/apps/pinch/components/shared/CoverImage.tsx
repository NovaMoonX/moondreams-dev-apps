import { join } from '@moondreamsdev/dreamer-ui/utils';

import FallbackImage from '@/components/FallbackImage';
import { useStorageImageUrl } from '@apps/pinch/hooks/useStorageImageUrl';

interface CoverImageProps {
  coverPath: string | null;
  /** The recipe's `updatedAt`, so a replaced cover is fetched again. */
  version: number;
  /** Edge length in pixels for a square tile, or omit and size it with `className`. */
  size?: number;
  className?: string;
}

/** A recipe's cover, or a soft-tint tile with a pot when it has none or the image can't load. */
function CoverImage({ coverPath, version, size, className }: CoverImageProps) {
  const url = useStorageImageUrl(coverPath, version);
  const tile = (
    <span
      aria-hidden='true'
      className='bg-accent text-accent-foreground flex h-full w-full items-center justify-center'
      style={size ? { fontSize: size * 0.45 } : { fontSize: '2.5rem' }}
    >
      🍲
    </span>
  );

  return (
    <span
      className={join(
        'inline-flex shrink-0 overflow-hidden rounded-xl',
        className,
      )}
      style={size ? { width: size, height: size } : undefined}
    >
      {url ? (
        <FallbackImage
          src={url}
          alt=''
          className='h-full w-full object-cover'
          fallback={tile}
        />
      ) : (
        tile
      )}
    </span>
  );
}

export default CoverImage;
