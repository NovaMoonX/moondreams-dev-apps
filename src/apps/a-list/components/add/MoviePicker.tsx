import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';

import SearchInput from '@/components/SearchInput';
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

  const trimmedQuery = query.trim();

  const hasQuery = trimmedQuery.length >= MOVIE_SEARCH_MIN_CHARS;
  // Results belong to the query that fetched them, so they never outlive the text that asked for them.
  const visibleResults = hasQuery ? results : [];
  const hasItems = watchlistMatches.length > 0 || visibleResults.length > 0;

  const getEmptyState = () => {
    if (hasItems) return null;
    if (trimmedQuery === '')
      return {
        emoji: '🍿',
        title: 'What are we watching?',
        body: 'Search by title to find a movie.',
        offerManual: false,
      };
    if (!hasQuery)
      return {
        emoji: '🔎',
        title: 'Keep typing',
        body: `Give us at least ${MOVIE_SEARCH_MIN_CHARS} letters to search with.`,
        offerManual: false,
      };
    // The debounce or the request hasn't caught up with what is typed.
    if (!canSearch || debouncedQuery !== trimmedQuery || search.isPending)
      return {
        emoji: '🎞️',
        title: 'Searching…',
        body: null,
        offerManual: false,
      };
    if (isSearchResting)
      return {
        emoji: '😴',
        title: 'Movie search is resting for today',
        body: 'You can still add a movie by its title.',
        offerManual: true,
      };
    if (search.error)
      return {
        emoji: '🛠️',
        title: "Search isn't available right now",
        body: 'You can still add a movie by its title.',
        offerManual: true,
      };
    return {
      emoji: '🤔',
      title: `No movies match “${trimmedQuery}”`,
      body: 'Check the spelling, or add it yourself.',
      offerManual: true,
    };
  };

  const emptyState = getEmptyState();

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
        size='stripped'
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
      <SearchInput
        autoFocus
        placeholder='Search movies or your watchlist'
        value={query}
        onChange={onQueryChange}
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
      {emptyState && (
        <div className='space-y-3 py-8 text-center'>
          <p className='text-5xl' aria-hidden='true'>
            {emptyState.emoji}
          </p>
          <div className='space-y-1'>
            <p className='font-semibold'>{emptyState.title}</p>
            {emptyState.body && (
              <p className='text-muted-foreground text-sm'>{emptyState.body}</p>
            )}
          </div>
          {emptyState.offerManual && (
            <Button
              type='button'
              rounded='full'
              variant={isSearchResting ? 'primary' : 'secondary'}
              onClick={onAddByTitle}
            >
              Can't find it? Add it by title
            </Button>
          )}
        </div>
      )}
      {visibleResults.length > 0 && (
        <div className='space-y-1'>
          <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            From search
          </h3>
          <ul className='space-y-0.5'>
            {visibleResults.map((movie) =>
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
    </div>
  );
}

export default MoviePicker;
