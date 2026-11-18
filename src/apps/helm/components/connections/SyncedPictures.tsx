import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import FallbackImage from '@/components/FallbackImage';
import { IMAGE_SHAPES } from '@/utils/imageShape';
import { useSyncedPictureUrl } from '@apps/helm/hooks/useSyncedPictureUrl';
import type { SyncedRecord } from '@apps/helm/types';
import { getPosterLink } from '@apps/helm/utils/syncedPictures';

interface SyncedAvatarProps {
  record: SyncedRecord;
  /** Drawn while the copy opens and when it can't be opened. */
  fallback: ReactNode;
  className: string;
}

export function SyncedAvatar({
  record,
  fallback,
  className,
}: SyncedAvatarProps) {
  const { url, isFailed } = useSyncedPictureUrl(record);
  if (!url || isFailed) return fallback;

  return (
    <span
      className={join(
        'bg-muted relative block shrink-0 overflow-hidden',
        className,
      )}
    >
      <FallbackImage
        src={url}
        alt=''
        fallback={fallback}
        className='size-full object-cover'
      />
    </span>
  );
}

/** A movie's poster, linked and never copied, in its source's 2:3 shape; nothing when the link isn't https or the picture fails. */
export function PosterThumb({
  record,
  className = 'w-10',
}: {
  record: SyncedRecord;
  className?: string;
}) {
  const link = getPosterLink(record);
  if (link === null) return null;

  return (
    <span
      className={join(
        'bg-muted block shrink-0 overflow-hidden rounded-md',
        className,
      )}
      style={{ aspectRatio: IMAGE_SHAPES.poster }}
    >
      <FallbackImage src={link} alt='' className='size-full object-cover' />
    </span>
  );
}
