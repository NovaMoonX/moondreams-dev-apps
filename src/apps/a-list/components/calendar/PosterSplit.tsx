import PosterCover from '@apps/a-list/components/shared/PosterCover';
import type { Viewing } from '@apps/a-list/types';

// Three wedges meet at the centre, 120° apart, with one edge pointing straight up. In a 2:3
// cell the other two edges meet the side walls at 50% + tan(30°) × 50% × ⅔ ≈ 69.25% down.
const SPLITS: Record<number, string[]> = {
  1: ['none'],
  2: ['polygon(0 0, 100% 0, 0 100%)', 'polygon(100% 0, 100% 100%, 0 100%)'],
  3: [
    'polygon(50% 50%, 50% 0, 100% 0, 100% 69.25%)',
    'polygon(50% 50%, 100% 69.25%, 100% 100%, 0 100%, 0 69.25%)',
    'polygon(50% 50%, 0 69.25%, 0 0, 50% 0)',
  ],
  4: [
    'inset(0 50% 50% 0)',
    'inset(0 0 50% 50%)',
    'inset(50% 50% 0 0)',
    'inset(50% 0 0 50%)',
  ],
};

// Each piece's title-tile text is pulled toward that piece, away from the cut lines.
// The cut lines between pieces, in the same percentages as the clips above.
const SEAMS: Record<number, Array<[number, number, number, number]>> = {
  2: [[100, 0, 0, 100]],
  3: [
    [50, 50, 50, 0],
    [50, 50, 100, 69.25],
    [50, 50, 0, 69.25],
  ],
  4: [
    [50, 0, 50, 100],
    [0, 50, 100, 50],
  ],
};

const TILE_TEXT: Record<number, string[]> = {
  1: ['items-center justify-center pt-5 text-center'],
  2: [
    'items-start justify-start text-left pt-6 pr-[40%]',
    'items-end justify-end text-right pl-[40%]',
  ],
  3: [
    'items-start justify-end text-right pt-6 pl-[52%]',
    'items-end justify-center text-center pt-[80%]',
    'items-start justify-start text-left pt-6 pr-[52%]',
  ],
  4: [
    'items-start justify-start text-left pt-6 pr-[52%] pb-[52%]',
    'items-start justify-end text-right pl-[52%] pb-[52%]',
    'items-end justify-start text-left pr-[52%] pt-[52%]',
    'items-end justify-end text-right pl-[52%] pt-[52%] pb-4',
  ],
};

interface PosterSplitProps {
  /** The day's viewings in showtime order. */
  viewings: Viewing[];
}

/** One to four covers, each filling the whole cell and clipped to its piece; past four, the rest are a "+N". */
function PosterSplit({ viewings }: PosterSplitProps) {
  const shown = viewings.slice(0, 4);
  const clips = SPLITS[shown.length] ?? [];
  const hiddenCount = viewings.length - shown.length;

  return (
    <span className='absolute inset-0 block'>
      {shown.map((viewing, index) => (
        <span
          key={viewing.id}
          className='absolute inset-0 block'
          style={{ clipPath: clips[index] }}
        >
          <PosterCover
            title={viewing.movie.title}
            posterUrl={viewing.movie.posterUrl}
            compact
            tileTextClassName={
              TILE_TEXT[shown.length]?.[index]
            }
          />
        </span>
      ))}
      {(SEAMS[shown.length] ?? []).length > 0 && (
        <svg
          className='pointer-events-none absolute inset-0 h-full w-full'
          viewBox='0 0 100 100'
          preserveAspectRatio='none'
          aria-hidden='true'
        >
          {(SEAMS[shown.length] ?? []).map(([x1, y1, x2, y2]) => (
            <line
              key={`${x1}-${y1}-${x2}-${y2}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke='var(--color-background)'
              strokeWidth={1.5}
              vectorEffect='non-scaling-stroke'
            />
          ))}
        </svg>
      )}
      {hiddenCount > 0 && (
        <span className='absolute right-0.5 bottom-0.5 rounded-full bg-black/60 px-1 text-[10px] font-semibold text-white'>
          +{hiddenCount}
        </span>
      )}
    </span>
  );
}

export default PosterSplit;
