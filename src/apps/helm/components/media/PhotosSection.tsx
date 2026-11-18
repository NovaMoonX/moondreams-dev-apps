import { useMemo, useState } from 'react';

import PhotoGrid from '@/components/PhotoGrid';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import MediaThumb from '@apps/helm/components/media/MediaThumb';
import MediaViewer from '@apps/helm/components/media/MediaViewer';
import { HELM_COPY, PHOTOS_PER_RECORD } from '@apps/helm/constants';
import type { PhotoOwner } from '@apps/helm/store/actions/mediaActions';

interface PhotosSectionProps {
  owner: PhotoOwner;
  name: string;
  /** Every photo the who or place keeps, in its stored order. */
  photoIds: string[];
  /** The main photo's media id; null when it has none. */
  mainId: string | null;
}

/** A who's or place's photos: a small square grid with the main one first, six at most and the rest behind a "+N" tile that opens them all; each opens in its sheet. Adding one is the header picture's menu. */
function PhotosSection({ owner, name, photoIds, mainId }: PhotosSectionProps) {
  const media = useAppSelector((state) => state.helm.media.items);
  const [viewedId, setViewedId] = useState<string | null>(null);
  const [isAllOpen, setIsAllOpen] = useState(false);

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

  const items = shown.map((entry, index) => ({
    id: entry.id,
    label: HELM_COPY.photoLabel(name, index + 1),
  }));

  const renderTile = (item: { id: string }) => {
    const entry = shown.find((candidate) => candidate.id === item.id);
    if (!entry) return null;
    return (
      <>
        <MediaThumb
          media={entry}
          alt=''
          className='size-full'
          fallback={
            <span className='text-muted-foreground grid size-full place-items-center p-1 text-center text-[11px]'>
              {HELM_COPY.photoUnreadable}
            </span>
          }
        />
        {entry.id === mainId && shown.length > 1 && (
          <span className='bg-background/85 text-foreground absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[11px] leading-none'>
            {HELM_COPY.photoMainBadge}
          </span>
        )}
      </>
    );
  };

  if (shown.length === 0) return null;

  return (
    <section className='space-y-3'>
      <SectionDivider
        label={
          shown.length >= PHOTOS_PER_RECORD - 3
            ? HELM_COPY.photosTitleCounted(shown.length)
            : HELM_COPY.photosTitle
        }
      />
      <PhotoGrid
        items={items}
        renderTile={renderTile}
        onOpen={setViewedId}
        onShowAll={() => setIsAllOpen(true)}
        showAllLabel={HELM_COPY.photosShowAll(shown.length)}
      />
      {isAllOpen && (
        <Subview overlay title={name} onClose={() => setIsAllOpen(false)}>
          <div>
            <PhotoGrid
              items={items}
              renderTile={renderTile}
              onOpen={setViewedId}
              onShowAll={() => undefined}
              showAllLabel=''
              limit={items.length}
            />
          </div>
        </Subview>
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
