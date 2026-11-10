import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import SectionDivider from '@/components/SectionDivider';
import PhotoPicker from '@/components/forms/PhotoPicker';
import { useAppSelector } from '@/store';
import MediaThumb from '@apps/helm/components/media/MediaThumb';
import MediaViewer from '@apps/helm/components/media/MediaViewer';
import { HELM_COPY, PHOTOS_PER_RECORD } from '@apps/helm/constants';
import { useMediaUpload } from '@apps/helm/hooks/useMediaUpload';
import type { PhotoOwner } from '@apps/helm/store/actions/mediaActions';

interface PhotosSectionProps {
  owner: PhotoOwner;
  name: string;
  /** Every photo the who or place keeps, in its stored order. */
  photoIds: string[];
  /** The main photo's media id; null when it has none. */
  mainId: string | null;
}

/** A who's or place's photos: the main one first and large, the rest in a row under it, each opening in its sheet, and a way to add another (the camera too, since the thing is often in front of the person). */
function PhotosSection({ owner, name, photoIds, mainId }: PhotosSectionProps) {
  const media = useAppSelector((state) => state.helm.media.items);
  const [viewedId, setViewedId] = useState<string | null>(null);
  const { add, isUploading, error } = useMediaUpload(
    owner,
    owner.kind === 'who' && mainId === null,
  );

  const shown = useMemo(
    () =>
      [
        ...(mainId ? [mainId] : []),
        ...photoIds.filter((id) => id !== mainId),
      ].flatMap((id) => {
        const found = media.find(
          (entry) => entry.id === id && entry.status === 'kept',
        );
        return found ? [found] : [];
      }),
    [media, photoIds, mainId],
  );
  const viewed = shown.find((entry) => entry.id === viewedId) ?? null;
  const isFull = photoIds.length >= PHOTOS_PER_RECORD;

  const tile = (entry: (typeof shown)[number], index: number) => (
    <Button
      type='button'
      variant='tertiary'
      className={
        index === 0
          ? 'relative block aspect-4/3 h-auto w-full overflow-hidden rounded-2xl p-0!'
          : 'relative block size-20 shrink-0 overflow-hidden rounded-xl p-0!'
      }
      aria-label={HELM_COPY.photoLabel(name, index + 1)}
      onClick={() => setViewedId(entry.id)}
    >
      <MediaThumb
        media={entry}
        alt=''
        className='size-full'
        fallback={
          <span className='text-muted-foreground grid size-full place-items-center text-[13px]'>
            {HELM_COPY.photoUnreadable}
          </span>
        }
      />
      {entry.id === mainId && shown.length > 1 && (
        <span className='bg-background/85 text-foreground absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-[12px]'>
          {HELM_COPY.photoMainBadge}
        </span>
      )}
    </Button>
  );

  return (
    <section className='space-y-3'>
      <SectionDivider
        label={
          shown.length >= PHOTOS_PER_RECORD - 3
            ? HELM_COPY.photosTitleCounted(shown.length)
            : HELM_COPY.photosTitle
        }
      />
      {shown.length === 0 && (
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.photosEmpty(name)}
        </p>
      )}
      {shown.length > 0 && tile(shown[0], 0)}
      {shown.length > 1 && (
        <ul className='-mx-4 flex gap-2 overflow-x-auto px-4 pb-1'>
          {shown.slice(1).map((entry, index) => (
            <li key={entry.id} className='shrink-0'>
              {tile(entry, index + 1)}
            </li>
          ))}
        </ul>
      )}
      {isFull ? (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.photoFull}
        </p>
      ) : (
        <PhotoPicker
          photoUrl={null}
          showPreview={false}
          canTakePhoto
          loading={isUploading}
          error={error}
          uploadLabel={HELM_COPY.photoAdd}
          onSelect={(file) => void add(file)}
        />
      )}
      {viewed && (
        <MediaViewer
          owner={owner}
          ownerName={name}
          media={viewed}
          isMain={viewed.id === mainId}
          position={shown.indexOf(viewed) + 1}
          total={shown.length}
          onClose={() => setViewedId(null)}
        />
      )}
    </section>
  );
}

export default PhotosSection;
