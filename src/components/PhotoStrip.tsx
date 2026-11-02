import { type ReactNode, useRef, useState, type UIEvent } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Camera, ChevronLeft, ChevronRight } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import ImageViewer from '@/components/ImageViewer';

export interface StripPhoto {
  id: string;
  /** Null while the address is still being found: the tile holds its box, so photos arriving never move what is below. */
  url: string | null;
  /** True when the address could not be found; the tile shows the same placeholder as an image that fails to load. */
  isMissing?: boolean;
}

interface PhotoStripProps {
  photos: StripPhoto[];
  /** Names the photos for screen readers and the viewer's caption, with its place appended ("Oak desk, photo 2"). */
  label: string;
  /** Drawn in place of the strip when no photo can be shown. */
  fallback?: ReactNode;
}

const TILE_BOX =
  'bg-muted aspect-4/3 h-auto max-h-[60dvh] w-full overflow-hidden rounded-2xl';

/** A sideways row of photos that snaps one at a time and lets the next peek in, with "1 / 5" under it, arrows from `sm`, and a tap that opens the pictures full screen. A photo that is loading holds its box, and one that fails shows a camera tile; the strip hides when none can be shown. */
function PhotoStrip({ photos, label, fallback = null }: PhotoStripProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [scrolledTo, setScrolledTo] = useState(0);
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());
  const [viewerStart, setViewerStart] = useState<number | null>(null);

  const isFailed = (photo: StripPhoto) =>
    photo.isMissing === true || failedIds.has(photo.id);
  const shown = photos.filter((photo) => !isFailed(photo));
  if (shown.length === 0) return fallback;

  const viewable = shown.flatMap((photo) =>
    photo.url === null ? [] : [{ id: photo.id, url: photo.url }],
  );
  const current = Math.min(scrolledTo, photos.length - 1);
  const position = Math.max(
    1,
    photos.slice(0, current + 1).filter((photo) => !isFailed(photo)).length,
  );

  const handleScroll = (event: UIEvent<HTMLUListElement>) => {
    const { scrollLeft, scrollWidth, clientWidth } = event.currentTarget;
    const step = scrollWidth / photos.length;
    setScrolledTo(
      scrollLeft + clientWidth >= scrollWidth - 2
        ? photos.length - 1
        : Math.min(
            photos.length - 1,
            Math.max(0, Math.round(scrollLeft / step)),
          ),
    );
  };

  const goTo = (index: number) => {
    const list = listRef.current;
    const tile = list?.children[index];
    if (!list || !tile) return;

    const box = list.getBoundingClientRect();
    const edge = tile.getBoundingClientRect();
    list.scrollTo({
      left:
        list.scrollLeft + edge.left - box.left - (box.width - edge.width) / 2,
      behavior: 'smooth',
    });
  };

  const renderTile = (photo: StripPhoto, index: number) => {
    if (isFailed(photo)) {
      return (
        <div
          role='img'
          aria-label={`${label}, photo ${index + 1}, not available`}
          className={join(
            TILE_BOX,
            'text-muted-foreground grid place-items-center',
          )}
        >
          <Camera className='size-8 opacity-60' aria-hidden='true' />
        </div>
      );
    }

    if (photo.url === null) {
      return <div className={TILE_BOX} aria-hidden='true' />;
    }

    return (
      <Button
        type='button'
        variant='tertiary'
        aria-label={`${label}, photo ${index + 1} of ${photos.length}, open`}
        className={join(
          TILE_BOX,
          "after:ring-foreground/5 relative px-0! py-0! after:pointer-events-none after:absolute after:inset-0 after:rounded-2xl after:ring-1 after:content-[''] after:ring-inset",
        )}
        onClick={() =>
          setViewerStart(viewable.findIndex((entry) => entry.id === photo.id))
        }
      >
        <FallbackImage
          src={photo.url}
          alt=''
          className='size-full object-cover'
          onError={() =>
            setFailedIds((previous) => new Set(previous).add(photo.id))
          }
        />
      </Button>
    );
  };

  return (
    <div className='space-y-1'>
      <div className='relative'>
        <ul
          ref={listRef}
          className='-mx-1 flex snap-x snap-mandatory [scrollbar-width:none] gap-2 overflow-x-auto px-1 pb-1'
          onScroll={handleScroll}
        >
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              className={join(
                'flex shrink-0 snap-center',
                photos.length === 1 ? 'w-full' : 'w-[85%] sm:w-[70%]',
              )}
            >
              {renderTile(photo, index)}
            </li>
          ))}
        </ul>
        {current > 0 && (
          <Button
            type='button'
            variant='secondary'
            size='icon'
            rounded='full'
            aria-label={`${label}, previous photo`}
            className='absolute top-1/2 left-2 size-10 -translate-y-1/2 max-sm:hidden'
            onClick={() => goTo(current - 1)}
          >
            <ChevronLeft className='size-5' aria-hidden='true' />
          </Button>
        )}
        {current < photos.length - 1 && (
          <Button
            type='button'
            variant='secondary'
            size='icon'
            rounded='full'
            aria-label={`${label}, next photo`}
            className='absolute top-1/2 right-2 size-10 -translate-y-1/2 max-sm:hidden'
            onClick={() => goTo(current + 1)}
          >
            <ChevronRight className='size-5' aria-hidden='true' />
          </Button>
        )}
      </div>
      {shown.length > 1 && (
        <p
          className='bg-muted text-muted-foreground mx-auto w-fit rounded-full px-2 py-0.5 text-xs tabular-nums'
          aria-hidden='true'
        >
          {position} / {shown.length}
        </p>
      )}
      {viewerStart !== null && viewerStart >= 0 && (
        <ImageViewer
          startIndex={viewerStart}
          label={`Photos of ${label}`}
          slides={viewable.map((photo, index) => ({
            caption: `${label}, photo ${index + 1}`,
            pictures: [{ src: photo.url, label: null }],
          }))}
          onClose={() => setViewerStart(null)}
        />
      )}
    </div>
  );
}

export default PhotoStrip;
