import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import FallbackImage from '@/components/FallbackImage';
import { useMediaUrl } from '@apps/helm/hooks/useMediaUrl';
import type { OpenMedia } from '@apps/helm/types';

interface MediaThumbProps {
  media: OpenMedia;
  /** Names the picture for screen readers; empty when a name beside it already does. */
  alt: string;
  /** Sizes and shapes the box; the picture covers it. */
  className?: string;
  /** Drawn when the photo can't be opened. */
  fallback?: ReactNode;
}

/** A photo's thumbnail, opened on this device. It holds its box while the sealed bytes arrive. */
function MediaThumb({
  media,
  alt,
  className,
  fallback = null,
}: MediaThumbProps) {
  const { url, isFailed } = useMediaUrl(media, 'thumb');

  return (
    <span
      className={join(
        'bg-muted relative block shrink-0 overflow-hidden',
        className,
      )}
    >
      {url && !isFailed ? (
        <FallbackImage
          src={url}
          alt={alt}
          fallback={fallback}
          className='size-full object-cover'
        />
      ) : (
        (isFailed || media.isUnreadable) && fallback
      )}
    </span>
  );
}

export default MediaThumb;
