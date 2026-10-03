import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';

import { DEBOUNCE_MS, useDebouncedValue } from '@/hooks/useDebounce';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import { MOVIE_SEARCH_MIN_CHARS } from '@apps/a-list/constants';
import { movieSearchQueryOptions } from '@apps/a-list/queries/movieQueries';
import type { MovieSearchResult } from '@apps/a-list/types';

interface MoviePickerProps {
  query: string;
  onQueryChange: (query: string) => void;
  onPick: (movie: MovieSearchResult) => void;
}

function MoviePicker({ query, onQueryChange, onPick }: MoviePickerProps) {
  const debouncedQuery = useDebouncedValue(
    query.trim(),
    DEBOUNCE_MS.autocomplete,
  );
  const canSearch = debouncedQuery.length >= MOVIE_SEARCH_MIN_CHARS;
  const search = useQuery({
    ...movieSearchQueryOptions(debouncedQuery),
    enabled: canSearch,
  });
  const results = search.data ?? [];

  const getStatusLine = () => {
    if (!canSearch) return 'Search for a movie by its title.';
    if (search.isPending) return 'Searching…';
    if (
      search.error instanceof FirebaseError &&
      search.error.code === 'functions/resource-exhausted'
    ) {
      return 'Movie search is resting for today. Try again tomorrow.';
    }
    if (search.error) return "Search isn't available right now.";
    if (results.length === 0) return 'No movies match that title.';
    return null;
  };

  const statusLine = getStatusLine();

  return (
    <div className='space-y-3'>
      <Input
        type='search'
        variant='outline'
        placeholder='Search movies'
        aria-label='Search movies'
        autoFocus
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {statusLine && (
        <p className='text-muted-foreground text-sm'>{statusLine}</p>
      )}
      {results.length > 0 && (
        <div className='space-y-1'>
          <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            From search
          </h3>
          <ul className='divide-border divide-y'>
            {results.map((movie) => (
              <li key={movie.movieKey}>
                <Button
                  type='button'
                  variant='tertiary'
                  onClick={() => onPick(movie)}
                  className='h-auto w-full justify-start gap-3 rounded-none px-0 py-2 text-left'
                >
                  <span className='h-14 w-10 shrink-0 overflow-hidden rounded'>
                    <PosterCover
                      title={movie.title}
                      posterUrl={movie.posterUrl}
                      compact
                    />
                  </span>
                  <span className='min-w-0'>
                    <span className='block truncate font-medium'>
                      {movie.title}
                    </span>
                    {movie.year !== null && (
                      <span className='text-muted-foreground block text-xs'>
                        {movie.year}
                      </span>
                    )}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default MoviePicker;
