import { useState } from 'react';

import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';

import ModalFooterActions from '@/components/ModalFooterActions';
import { formatDateUTC, formatDuration } from '@/utils/formatUtils';
import MoviePicker from '@apps/a-list/components/add/MoviePicker';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import { movieDetailsQueryOptions } from '@apps/a-list/queries/movieQueries';
import type { MovieSearchResult } from '@apps/a-list/types';

interface AddDrawerProps {
  onClose: () => void;
}

function AddDrawer({ onClose }: AddDrawerProps) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<MovieSearchResult | null>(null);
  const details = useQuery({
    ...movieDetailsQueryOptions(picked?.movieKey ?? ''),
    enabled: picked !== null,
  });
  const movie = details.data;

  const getDetailsLine = () => {
    if (details.isPending) return 'Getting the details…';
    if (details.error || !movie)
      return "We couldn't load this movie's details just now.";
    const parts = [
      movie.releaseDate === null
        ? 'Release date not announced'
        : `Releases ${formatDateUTC(movie.releaseDate)}`,
      movie.runtimeMinutes === null
        ? null
        : formatDuration(movie.runtimeMinutes * 60_000),
      movie.contentRating,
    ];
    return parts.filter(Boolean).join(' · ');
  };

  return (
    <Drawer isOpen onClose={onClose} title='Movie'>
      {picked === null ? (
        <MoviePicker
          query={query}
          onQueryChange={setQuery}
          onPick={setPicked}
        />
      ) : (
        <div className='space-y-4'>
          <Button
            type='button'
            variant='link'
            size='sm'
            className='gap-1 px-0'
            onClick={() => setPicked(null)}
          >
            <ChevronLeft className='h-4 w-4' /> Back to results
          </Button>
          <div className='flex gap-3'>
            <span className='h-30 w-20 shrink-0 overflow-hidden rounded-md'>
              <PosterCover
                title={movie?.title ?? picked.title}
                posterUrl={movie?.posterUrl ?? picked.posterUrl}
              />
            </span>
            <div className='min-w-0 space-y-1'>
              <p className='font-semibold'>{movie?.title ?? picked.title}</p>
              <p className='text-muted-foreground text-sm'>
                {getDetailsLine()}
              </p>
            </div>
          </div>
          <ModalFooterActions
            rightActions={
              <>
                <Button type='button' variant='secondary' onClick={onClose}>
                  Cancel
                </Button>
                <Button type='button' disabled>
                  Add
                </Button>
              </>
            }
          />
        </div>
      )}
    </Drawer>
  );
}

export default AddDrawer;
