import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';

import { DEBOUNCE_MS, useDebouncedValue } from '@/hooks/useDebounce';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { normalizeString } from '@/utils/stringUtils';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import {
  MOVIE_SEARCH_MIN_CHARS,
  WATCH_PRIORITY_LABELS,
} from '@apps/a-list/constants';
import { movieSearchQueryOptions } from '@apps/a-list/queries/movieQueries';
import {
  selectSeenCountByMovieKey,
  selectWatchlistItems,
} from '@apps/a-list/store/selectors';
import type { MovieSearchResult, WatchlistItem } from '@apps/a-list/types';

interface MoviePickerProps {
  query: string;
  onQueryChange: (query: string) => void;
  onPick: (movie: MovieSearchResult) => void;
  onPickWatchlistItem: (item: WatchlistItem) => void;
  onAddByTitle: () => void;
  /** Calendar adds pick from the watchlist first; watchlist adds search the movie database only. */
  showWatchlist: boolean;
}

function MoviePicker({
  query,
  onQueryChange,
  onPick,
  onPickWatchlistItem,
  onAddByTitle,
  showWatchlist,
}: MoviePickerProps) {
  const watchlist = useAppSelector(selectWatchlistItems);
  const seenCounts = useAppSelector(selectSeenCountByMovieKey);
  const debouncedQuery = useDebouncedValue(
    query.trim(),
    DEBOUNCE_MS.autocomplete,
  );
  const canSearch = debouncedQuery.length >= MOVIE_SEARCH_MIN_CHARS;
  const search = useQuery({
    ...movieSearchQueryOptions(debouncedQuery),
    enabled: canSearch,
  });
  const normalizedQuery = normalizeString(query);
  // An empty search shows what's still unseen; typing searches the whole list, so a rewatch can be picked.
  const isWatchlistMatch = (item: WatchlistItem) => {
    if (!showWatchlist) return false;
    if (normalizedQuery === '') return !seenCounts[item.movieKey];
    return normalizeString(item.movie.title).includes(normalizedQuery);
  };
  const watchlistMatches = watchlist.filter(isWatchlistMatch);
  const listedKeys = new Set(watchlist.map((item) => item.movieKey));
  const watchlistKeys = new Set(watchlistMatches.map((item) => item.movieKey));
  const results = (search.data ?? []).filter(
    (movie) => !watchlistKeys.has(movie.movieKey),
  );
  const isSearchResting =
    search.error instanceof FirebaseError &&
    (search.error.code === 'functions/resource-exhausted' ||
      search.error.code === 'functions/failed-precondition');

  const getStatusLine = () => {
    if (!canSearch)
      return watchlistMatches.length === 0
        ? 'Search for a movie by its title.'
        : null;
    if (search.isPending) return 'Searching…';
    if (isSearchResting)
      return 'Movie search is resting for today, but you can still add a movie by its title.';
    if (search.error) return "Search isn't available right now.";
    if (results.length === 0 && watchlistMatches.length === 0)
      return 'No movies match that title.';
    return null;
  };

  const statusLine = getStatusLine();

  const renderRow = (
    key: string,
    title: string,
    posterUrl: string | null,
    detail: string | null,
    onClick: () => void,
  ) => (
    <li key={key}>
      <Button
        type='button'
        variant='tertiary'
        onClick={onClick}
        className='text-foreground! hover:bg-muted h-auto w-full justify-start gap-3 rounded-2xl px-2 py-2 text-left'
      >
        <span className='h-14 w-10 shrink-0 overflow-hidden rounded-lg shadow-sm'>
          <PosterCover title={title} posterUrl={posterUrl} compact />
        </span>
        <span className='min-w-0'>
          <span className='block truncate font-medium'>{title}</span>
          {detail && (
            <span className='text-muted-foreground block text-xs'>
              {detail}
            </span>
          )}
        </span>
      </Button>
    </li>
  );

  return (
    <div className='space-y-3'>
      <Input
        type='search'
        variant='outline'
        rounded='full'
        placeholder='Search movies or your watchlist'
        aria-label='Search movies'
        autoFocus
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {watchlistMatches.length > 0 && (
        <div className='space-y-1'>
          <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            On your watchlist
          </h3>
          <ul className='space-y-0.5'>
            {watchlistMatches.map((item) =>
              renderRow(
                item.movieKey,
                item.movie.title,
                item.movie.posterUrl,
                [
                  item.movie.releaseDate === null
                    ? null
                    : formatDateUTC(item.movie.releaseDate),
                  WATCH_PRIORITY_LABELS[item.priority],
                ]
                  .filter(Boolean)
                  .join(' · '),
                () => onPickWatchlistItem(item),
              ),
            )}
          </ul>
        </div>
      )}
      {statusLine && (
        <p className='text-muted-foreground text-sm'>{statusLine}</p>
      )}
      {results.length > 0 && (
        <div className='space-y-1'>
          <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            From search
          </h3>
          <ul className='space-y-0.5'>
            {results.map((movie) =>
              renderRow(
                movie.movieKey,
                movie.title,
                movie.posterUrl,
                [
                  movie.year,
                  listedKeys.has(movie.movieKey) ? 'On your watchlist' : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || null,
                () => onPick(movie),
              ),
            )}
          </ul>
        </div>
      )}
      <Button
        type='button'
        variant={isSearchResting ? 'primary' : 'link'}
        size='sm'
        rounded='full'
        className={isSearchResting ? undefined : 'px-0'}
        onClick={onAddByTitle}
      >
        + Can't find it? Add it by title
      </Button>
    </div>
  );
}

export default MoviePicker;
