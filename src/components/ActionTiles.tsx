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

/** A sheet's everyday actions as one strip of up to three equal cells, icon over a short label, in the action rows' card; rarer actions stay rows. */
function ActionTiles({ tiles }: ActionTilesProps) {
  if (tiles.length === 0) return null;
  const shown = tiles.slice(0, 3);
  return (
    <div
      className={join(
        'border-border bg-muted/50 divide-border grid divide-x overflow-hidden rounded-2xl border',
        shown.length === 1 && 'grid-cols-1',
        shown.length === 2 && 'grid-cols-2',
        shown.length >= 3 && 'grid-cols-3',
      )}
    >
      {shown.map((tile) => (
        <Button
          key={tile.key}
          type='button'
          variant='tertiary'
          rounded='none'
          onClick={tile.onClick}
          className='text-foreground! hover:bg-muted active:bg-muted h-auto min-h-16 w-full min-w-0 flex-col justify-start gap-1 px-1! pt-3 pb-2.5 text-center font-normal whitespace-normal first:rounded-l-2xl! last:rounded-r-2xl! focus-visible:outline-2 focus-visible:-outline-offset-2 [&_svg]:size-[18px]'
        >
          <span
            aria-hidden='true'
            className='text-muted-foreground grid place-items-center'
          >
            {tile.icon}
          </span>
          <span className='text-[13px] leading-4 font-medium'>
            {tile.label}
          </span>
        </Button>
      ))}
    </div>
  );
}

export default ActionTiles;
