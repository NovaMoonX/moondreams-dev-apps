import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { join } from '@moondreamsdev/dreamer-ui/utils';

export interface ActionTile {
  key: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

interface ActionTilesProps {
  tiles: readonly ActionTile[];
}

/** A sheet's everyday actions as one row of up to three equal tiles, icon over a short label; rarer actions stay rows. */
function ActionTiles({ tiles }: ActionTilesProps) {
  if (tiles.length === 0) return null;
  return (
    <div
      className={join(
        'grid gap-2',
        tiles.length === 1 && 'grid-cols-1',
        tiles.length === 2 && 'grid-cols-2',
        tiles.length >= 3 && 'grid-cols-3',
      )}
    >
      {tiles.slice(0, 3).map((tile) => (
        <Button
          key={tile.key}
          type='button'
          variant='tertiary'
          onClick={tile.onClick}
          className='bg-accent/50 border-border text-accent-foreground active:bg-accent h-auto min-h-[80px] w-full min-w-0 flex-col justify-center gap-1.5 rounded-xl border px-1! py-2.5 text-center font-normal whitespace-normal [&_svg]:size-5'
        >
          <span aria-hidden='true' className='grid place-items-center'>
            {tile.icon}
          </span>
          <span className='text-foreground text-[13px] leading-4 font-medium'>
            {tile.label}
          </span>
        </Button>
      ))}
    </div>
  );
}

export default ActionTiles;
