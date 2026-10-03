import { useState } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

const TILE_TINTS = [
  'bg-rose-200 text-rose-950 dark:bg-rose-900 dark:text-rose-50',
  'bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-50',
  'bg-emerald-200 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-50',
  'bg-sky-200 text-sky-950 dark:bg-sky-900 dark:text-sky-50',
  'bg-violet-200 text-violet-950 dark:bg-violet-900 dark:text-violet-50',
];

interface PosterCoverProps {
  title: string;
  posterUrl: string | null;
  className?: string;
  /** Smaller type for thumbnails. */
  compact?: boolean;
}

/** A poster that falls back to a tinted title tile, so a cell or row is never left with a hole. */
function PosterCover({
  title,
  posterUrl,
  className,
  compact = false,
}: PosterCoverProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = posterUrl !== null && failedUrl !== posterUrl;
  const tint =
    TILE_TINTS[
      [...title].reduce((sum, character) => sum + character.charCodeAt(0), 0) %
        TILE_TINTS.length
    ];

  if (showImage) {
    return (
      <img
        src={posterUrl}
        alt={`${title} poster`}
        loading='lazy'
        referrerPolicy='no-referrer'
        onError={() => setFailedUrl(posterUrl)}
        className={join('h-full w-full object-cover', className)}
      />
    );
  }

  return (
    <div
      role='img'
      aria-label={`${title} poster`}
      className={join(
        'flex h-full w-full items-center justify-center overflow-hidden p-1 text-center',
        tint,
        className,
      )}
    >
      <span
        className={join(
          'line-clamp-3 leading-tight font-semibold break-words',
          compact ? 'text-[9px]' : 'text-xs',
        )}
      >
        {title}
      </span>
    </div>
  );
}

export default PosterCover;
