import FallbackImage from '@/components/FallbackImage';
import { IDEA_KIND_EMOJIS } from '@apps/pinch/constants';
import { useIdeaImageUrl } from '@apps/pinch/hooks/useIdeaImageUrl';
import type { Idea } from '@apps/pinch/types';

interface IdeaThumbnailProps {
  idea: Idea;
  size?: number;
}

function IdeaThumbnail({ idea, size = 56 }: IdeaThumbnailProps) {
  const url = useIdeaImageUrl(idea);
  const tile = (
    <span
      aria-hidden='true'
      className='bg-accent text-accent-foreground flex h-full w-full items-center justify-center'
      style={{ fontSize: size * 0.45 }}
    >
      {IDEA_KIND_EMOJIS[idea.kind]}
    </span>
  );

  return (
    <span
      className='inline-flex shrink-0 overflow-hidden rounded-xl'
      style={{ width: size, height: size }}
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

export default IdeaThumbnail;
