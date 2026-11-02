import { useState, type UIEvent } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import FallbackImage from '@/components/FallbackImage';
import ImageViewer from '@/components/ImageViewer';

export interface StripPhoto {
  id: string;
  url: string;
}

interface PhotoStripProps {
  photos: StripPhoto[];
  /** Names the photos for screen readers and the viewer's caption, with its place appended ("Oak desk, photo 2"). */
  label: string;
}

/** A sideways row of photos that snaps one at a time and lets the next peek in, with "1 / 5" and a tap that opens the pictures full screen. */
function PhotoStrip({ photos, label }: PhotoStripProps) {
  const [scrolledTo, setScrolledTo] = useState(0);
  const [viewerStart, setViewerStart] = useState<number | null>(null);

  if (photos.length === 0) return null;

  const current = Math.min(scrolledTo, photos.length - 1);

  const handleScroll = (event: UIEvent<HTMLUListElement>) => {
    const { scrollLeft, scrollWidth } = event.currentTarget;
    const step = scrollWidth / photos.length;
    setScrolledTo(
      Math.min(photos.length - 1, Math.max(0, Math.round(scrollLeft / step))),
    );
  };

  return (
    <div className='relative'>
      <ul
        className='-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1'
        onScroll={handleScroll}
      >
        {photos.map((photo, index) => (
          <li
            key={photo.id}
            className={join(
              'shrink-0 snap-center',
              photos.length === 1 ? 'w-full' : 'w-[85%] sm:w-[70%]',
            )}
          >
            <Button
              type='button'
              variant='tertiary'
              aria-label={`${label}, photo ${index + 1} of ${photos.length}, open`}
              className='bg-muted aspect-4/3 h-auto w-full overflow-hidden rounded-2xl px-0! py-0!'
              onClick={() => setViewerStart(index)}
            >
              <FallbackImage
                src={photo.url}
                alt=''
                className='size-full object-cover'
              />
            </Button>
          </li>
        ))}
      </ul>
      {photos.length > 1 && (
        <p
          className='bg-foreground/70 text-background pointer-events-none absolute top-2 right-3 rounded-full px-2 py-0.5 text-xs tabular-nums'
          aria-hidden='true'
        >
          {current + 1} / {photos.length}
        </p>
      )}
      {viewerStart !== null && (
        <ImageViewer
          startIndex={viewerStart}
          label={`Photos of ${label}`}
          slides={photos.map((photo, index) => ({
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
