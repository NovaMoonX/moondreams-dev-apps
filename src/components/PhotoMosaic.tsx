import { useState, type ReactNode } from 'react';

import FallbackImage from '@/components/FallbackImage';

const MAX_PHOTOS = 4;

// Each photo fills the whole cover and is clipped to its piece, so a piece never letterboxes.
const PIECES: Record<number, string[]> = {
  1: ['none'],
  2: ['polygon(0 0, 100% 0, 0 100%)', 'polygon(100% 0, 100% 100%, 0 100%)'],
  3: ['inset(0 50% 0 0)', 'inset(0 0 50% 50%)', 'inset(50% 0 0 50%)'],
  4: [
    'inset(0 50% 50% 0)',
    'inset(0 0 50% 50%)',
    'inset(50% 50% 0 0)',
    'inset(50% 0 0 50%)',
  ],
};

const SEAMS: Record<number, Array<[number, number, number, number]>> = {
  2: [[100, 0, 0, 100]],
  3: [
    [50, 0, 50, 100],
    [50, 50, 100, 50],
  ],
  4: [
    [50, 0, 50, 100],
    [0, 50, 100, 50],
  ],
};

interface PhotoMosaicProps {
  /** Most important first: the first photo takes the largest piece. `null` is a photo still loading, which keeps its piece. Past four, the rest are left out. */
  urls: (string | null)[];
  /** Drawn alone when there is no photo, or when every photo fails to load. */
  placeholder: ReactNode;
}

/** One cover for a group of things that each have a photo: one fills it, two split on the diagonal, three put the first on the left half, four make quarters; a photo that fails to load gives its piece to the rest. Fills its positioned parent. */
function PhotoMosaic({ urls, placeholder }: PhotoMosaicProps) {
  const [failed, setFailed] = useState<string[]>([]);
  const shown = urls
    .filter((url) => url === null || !failed.includes(url))
    .slice(0, MAX_PHOTOS);
  const pieces = PIECES[shown.length] ?? [];
  const seams = SEAMS[shown.length] ?? [];

  if (shown.length === 0)
    return (
      <span className='absolute inset-0 grid place-items-center'>
        {placeholder}
      </span>
    );

  return (
    <span className='absolute inset-0 block'>
      {shown.map((url, index) => (
        <span
          key={url ?? `loading-${index}`}
          className='absolute inset-0 grid place-items-center'
          style={{ clipPath: pieces[index] }}
        >
          {url !== null && (
            <FallbackImage
              src={url}
              alt=''
              className='absolute inset-0 size-full object-cover'
              onError={() =>
                setFailed((current) =>
                  current.includes(url) ? current : [...current, url],
                )
              }
            />
          )}
        </span>
      ))}
      {seams.length > 0 && (
        <svg
          className='pointer-events-none absolute inset-0 size-full'
          viewBox='0 0 100 100'
          preserveAspectRatio='none'
          aria-hidden='true'
        >
          {seams.map(([x1, y1, x2, y2]) => (
            <line
              key={`${x1}-${y1}-${x2}-${y2}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke='var(--color-card)'
              strokeWidth={2}
              vectorEffect='non-scaling-stroke'
            />
          ))}
        </svg>
      )}
    </span>
  );
}

export default PhotoMosaic;
