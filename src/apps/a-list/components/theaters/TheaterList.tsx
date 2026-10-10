import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Star, Trash2 } from 'lucide-react';

import TheaterRow from '@apps/a-list/components/theaters/TheaterRow';
import type { TheatreSnapshot } from '@apps/a-list/types';
import {
  formatTheatreLocation,
  isTypedTheatre,
} from '@apps/a-list/utils/theatres';

interface TheaterListProps {
  theatres: TheatreSnapshot[];
  favoriteId: string | null;
  isDisabled?: boolean;
  onToggleFavorite: (theatreId: string) => void;
  onRemove: (theatre: TheatreSnapshot) => void;
  /** Offered on a typed theater, so it can become the real AMC one without re-tagging showings. */
  onLink?: (theatre: TheatreSnapshot) => void;
}

function TheaterList({
  theatres,
  favoriteId,
  isDisabled = false,
  onToggleFavorite,
  onRemove,
  onLink,
}: TheaterListProps) {
  return (
    <ul className='border-border bg-card divide-border divide-y overflow-hidden rounded-2xl border'>
      {theatres.map((theatre) => {
        const isFavorite = theatre.theatreId === favoriteId;
        return (
          <TheaterRow
            key={theatre.theatreId}
            name={theatre.name}
            detail={
              isTypedTheatre(theatre)
                ? 'Not linked to AMC'
                : formatTheatreLocation(theatre)
            }
            footer={
              onLink && isTypedTheatre(theatre) ? (
                <Button
                  type='button'
                  size='sm'
                  variant='secondary'
                  rounded='full'
                  className='relative h-8 w-full whitespace-nowrap before:absolute before:inset-x-0 before:-inset-y-1 sm:w-auto'
                  disabled={isDisabled}
                  onClick={() => onLink(theatre)}
                >
                  🔗 Link to the AMC theater
                </Button>
              ) : undefined
            }
            trailing={
              <div className='flex items-center gap-1'>
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
                      isFavorite
                        ? 'text-primary fill-current'
                        : 'text-muted-foreground',
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
                  className='text-muted-foreground! hover:text-destructive! h-10 w-10'
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
