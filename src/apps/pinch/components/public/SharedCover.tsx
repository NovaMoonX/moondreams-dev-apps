import { useQuery } from '@tanstack/react-query';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import FallbackImage from '@/components/FallbackImage';
import { sharedCoverQueryOptions } from '@apps/pinch/queries/shareQueries';

interface SharedCoverProps {
  shareId: string;
  index: number | null;
  hasCover: boolean;
  emoji: string;
  className?: string;
  emojiClassName?: string;
}

/** A shared cover is read only from our own Storage; one that can't load leaves the tile, never a broken picture. */
function SharedCover({
  shareId,
  index,
  hasCover,
  emoji,
  className,
  emojiClassName = 'text-4xl',
}: SharedCoverProps) {
  const { data: url } = useQuery({
    ...sharedCoverQueryOptions(shareId, index ?? 0),
    enabled: hasCover && index !== null,
  });
  const tile = (
    <span
      aria-hidden='true'
      className={join(
        'bg-accent text-accent-foreground flex size-full items-center justify-center',
        emojiClassName,
      )}
    >
      {emoji}
    </span>
  );

  return (
    <span
      className={join(
        'border-border inline-flex shrink-0 overflow-hidden border',
        className,
      )}
    >
      {url ? (
        <FallbackImage
          src={url}
          alt=''
          loading='eager'
          referrerPolicy='no-referrer'
          className='size-full object-cover'
          fallback={tile}
        />
      ) : (
        tile
      )}
    </span>
  );
}

export default SharedCover;
