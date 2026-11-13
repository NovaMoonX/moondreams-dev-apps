import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAppSelector } from '@/store';
import MediaThumb from '@apps/helm/components/media/MediaThumb';
import WhoMark from '@apps/helm/components/who/WhoMark';
import type { WhoKind } from '@apps/helm/types';

interface WhoPhotoProps {
  kind: WhoKind | 'place';
  name: string;
  /** The main photo's media id; null for none. */
  mediaId: string | null;
  isLarge?: boolean;
}

/** A who's or place's main photo as the round picture beside its name, or its mark (initial, paw, building or pin) when it has none or the photo can't be shown. */
function WhoPhoto({ kind, name, mediaId, isLarge = false }: WhoPhotoProps) {
  const media = useAppSelector((state) =>
    mediaId === null
      ? null
      : (state.helm.media.items.find(
          (entry) => entry.id === mediaId && entry.status === 'kept',
        ) ?? null),
  );
  const mark = <WhoMark kind={kind} name={name} isLarge={isLarge} />;
  if (!media || media.isUnreadable) return mark;

  return (
    <MediaThumb
      media={media}
      alt=''
      fallback={mark}
      className={join('rounded-full', isLarge ? 'size-14' : 'size-10')}
    />
  );
}

export default WhoPhoto;
