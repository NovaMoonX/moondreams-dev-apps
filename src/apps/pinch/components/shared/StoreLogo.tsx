import { join } from '@moondreamsdev/dreamer-ui/utils';

import FallbackImage from '@/components/FallbackImage';
import { useStorageImageUrl } from '@apps/pinch/hooks/useStorageImageUrl';
import { storeLogoUrl } from '@apps/pinch/utils/storeLogo';

interface StoreLogoProps {
  name: string;
  /** A well-known store's website, which its logo is looked up by. */
  domain?: string | null;
  /** The person's own image, with the store's `updatedAt` so a replaced image is fetched again. */
  imagePath?: string | null;
  imageVersion?: number;
  size?: number;
  className?: string;
}

/** A round logo tile: the person's own image, else the well-known store's logo, else the first letter of its name. */
function StoreLogo({
  name,
  domain = null,
  imagePath = null,
  imageVersion = 0,
  size = 40,
  className,
}: StoreLogoProps) {
  const ownUrl = useStorageImageUrl(imagePath, imageVersion);
  const url =
    ownUrl ?? (imagePath === null && domain ? storeLogoUrl(domain) : null);

  const letter = (
    <span
      aria-hidden='true'
      className='bg-secondary text-secondary-foreground flex h-full w-full items-center justify-center font-semibold'
      style={{ fontSize: size * 0.42 }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );

  return (
    <span
      className={join(
        'border-border inline-flex shrink-0 overflow-hidden rounded-full border bg-white',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {url ? (
        <FallbackImage
          src={url}
          alt=''
          className='h-full w-full object-contain'
          fallback={letter}
        />
      ) : (
        letter
      )}
    </span>
  );
}

export default StoreLogo;
