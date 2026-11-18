import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { IMAGE_SHAPES, type ImageShape } from '@/utils/imageShape';

export interface PhotoGridItem {
  id: string;
  /** Names the tile for screen readers. */
  label: string;
}

interface PhotoGridProps {
  items: PhotoGridItem[];
  /** Draws a tile's picture; it fills the tile's box, so cover it and hold the box while loading. */
  renderTile: (item: PhotoGridItem, index: number) => ReactNode;
  onOpen: (id: string) => void;
  /** Called by the "+N" tile when there are more photos than `limit`. */
  onShowAll: () => void;
  /** Names the "+N" tile for screen readers. */
  showAllLabel: string;
  limit?: number;
  /** The tiles' shape: square for the person's own photos, the source's shape for pictures from another app. */
  shape?: ImageShape;
}

/** A small grid of photos, 3 across, that shows at most `limit` and ends in a "+N" tile that opens the rest. */
function PhotoGrid({
  items,
  renderTile,
  onOpen,
  onShowAll,
  showAllLabel,
  limit = 6,
  shape = 'square',
}: PhotoGridProps) {
  const hasMore = items.length > limit;
  const shown = hasMore ? items.slice(0, limit) : items;

  return (
    <ul className='grid max-w-md grid-cols-3 gap-2'>
      {shown.map((item, index) => {
        const isMoreTile = hasMore && index === shown.length - 1;
        return (
          <li key={item.id}>
            <Button
              type='button'
              variant='tertiary'
              className='relative block h-auto w-full overflow-hidden rounded-xl p-0!'
              style={{ aspectRatio: IMAGE_SHAPES[shape] }}
              aria-label={isMoreTile ? showAllLabel : item.label}
              onClick={() => (isMoreTile ? onShowAll() : onOpen(item.id))}
            >
              <span className='absolute inset-0'>
                {renderTile(item, index)}
              </span>
              {isMoreTile && (
                <span
                  className='absolute inset-0 grid place-items-center bg-black/55 text-lg font-medium text-white'
                  aria-hidden='true'
                >
                  +{items.length - shown.length + 1}
                </span>
              )}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export default PhotoGrid;
