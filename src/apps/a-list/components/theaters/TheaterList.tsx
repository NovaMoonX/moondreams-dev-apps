import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Star, Trash2 } from 'lucide-react';

import TheaterRow from '@apps/a-list/components/theaters/TheaterRow';
import type { TheatreSnapshot } from '@apps/a-list/types';
import { formatTheatreLocation } from '@apps/a-list/utils/theatres';

interface TheaterListProps {
  theatres: TheatreSnapshot[];
  favoriteId: string | null;
  isDisabled?: boolean;
  onToggleFavorite: (theatreId: string) => void;
  onRemove: (theatre: TheatreSnapshot) => void;
}

function TheaterList({
  theatres,
  favoriteId,
  isDisabled = false,
  onToggleFavorite,
  onRemove,
}: TheaterListProps) {
  return (
    <ul className='border-border bg-card divide-border divide-y overflow-hidden rounded-2xl border'>
      {theatres.map((theatre) => {
        const isFavorite = theatre.theatreId === favoriteId;
        return (
          <TheaterRow
            key={theatre.theatreId}
            name={theatre.name}
            detail={formatTheatreLocation(theatre)}
            trailing={
              <div className='flex shrink-0 items-center gap-1'>
                <Button
                  type='button'
                  variant='tertiary'
                  size='icon'
                  rounded='full'
                  className='h-10 w-10'
                  disabled={isDisabled}
                  aria-pressed={isFavorite}
                  aria-label={
                    isFavorite
                      ? `${theatre.name} is your favorite`
                      : `Make ${theatre.name} your favorite`
                  }
                  onClick={() => onToggleFavorite(theatre.theatreId)}
                >
                  <Star
                    className={join(
                      'h-4 w-4',
                      isFavorite && 'text-primary fill-current',
                    )}
                  />
                </Button>
                <Button
                  type='button'
                  variant='tertiary'
                  size='icon'
                  rounded='full'
                  disabled={isDisabled}
                  aria-label={`Remove ${theatre.name}`}
                  className='text-destructive!'
                  onClick={() => onRemove(theatre)}
                >
                  <Trash2 className='h-4 w-4' />
                </Button>
              </div>
            }
          />
        );
      })}
    </ul>
  );
}

export default TheaterList;
