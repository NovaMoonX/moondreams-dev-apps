import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAppSelector } from '@/store';
import MediaThumb from '@apps/helm/components/media/MediaThumb';
import WhoMark from '@apps/helm/components/who/WhoMark';
import { SyncedAvatar } from '@apps/helm/components/connections/SyncedPictures';
import type { AppSource, WhoKind } from '@apps/helm/types';
import { findAppPicture } from '@apps/helm/utils/syncedPictures';

interface WhoPhotoProps {
  kind: WhoKind | 'place';
  name: string;
  /** The main photo's media id; null for none. */
  mediaId: string | null;
  /** Where the who was brought in from; a pet's photo in its app shows when the who has none of its own. */
  appSources?: AppSource[];
  isLarge?: boolean;
}

/** A who's or place's main photo as the round picture beside its name, or its mark (initial, paw, building or pin) when it has none or the photo can't be shown. */
function WhoPhoto({
  kind,
  name,
  mediaId,
  appSources = [],
  isLarge = false,
}: WhoPhotoProps) {
  const media = useAppSelector((state) =>
    mediaId === null
      ? null
      : (state.helm.media.items.find(
          (entry) => entry.id === mediaId && entry.status === 'kept',
        ) ?? null),
  );
  const appRecord = useAppSelector((state) =>
    media === null && appSources.length > 0
      ? findAppPicture(state.helm.synced.items, appSources)
      : null,
  );
  const mark = <WhoMark kind={kind} name={name} isLarge={isLarge} />;
  if (appRecord)
    return (
      <SyncedAvatar
        record={appRecord}
        fallback={mark}
        className={isLarge ? 'size-14 rounded-full' : 'size-10 rounded-full'}
      />
    );
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
