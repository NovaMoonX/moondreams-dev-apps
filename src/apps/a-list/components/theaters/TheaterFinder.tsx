import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';
import { LocateFixed } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import { DEBOUNCE_MS, useDebouncedValue } from '@/hooks/useDebounce';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  getCurrentCoordinates,
  type Coordinates,
} from '@/utils/geolocationUtils';
import TheaterRow from '@apps/a-list/components/theaters/TheaterRow';
import {
  MAX_THEATRES,
  THEATRE_SEARCH_MAX_CHARS,
  THEATRE_SEARCH_MIN_CHARS,
} from '@apps/a-list/constants';
import {
  findTheatresQueryOptions,
  type TheatreSearch,
} from '@apps/a-list/queries/theatreQueries';
import type { TheatreSearchResult } from '@apps/a-list/types';
import { formatTheatreLocation } from '@apps/a-list/utils/theatres';

interface TheaterFinderProps {
  savedIds: string[];
  onAdd: (theatre: TheatreSearchResult) => void;
  isDisabled?: boolean;
}

const NO_SEARCH: TheatreSearch = { kind: 'text', query: '' };

function TheaterFinder({
  savedIds,
  onAdd,
  isDisabled = false,
}: TheaterFinderProps) {
  const [query, setQuery] = useState('');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  // Typing while the location prompt is open must win over the answer that arrives later.
  const locationRequest = useRef(0);
  const debouncedQuery = useDebouncedValue(
    query.trim(),
    DEBOUNCE_MS.autocomplete,
  );
  const trimmedQuery = query.trim();
  const isSearchable = (text: string) =>
    text.length >= THEATRE_SEARCH_MIN_CHARS &&
    text.length <= THEATRE_SEARCH_MAX_CHARS;
  const hasQuery = isSearchable(trimmedQuery);
  const getSearch = (): TheatreSearch | null => {
    if (coordinates) return { kind: 'coordinates', ...coordinates };
    if (isSearchable(debouncedQuery)) {
      return { kind: 'text', query: debouncedQuery };
    }
    return null;
  };
  const search = getSearch();
  const results = useQuery({
    ...findTheatresQueryOptions(search ?? NO_SEARCH),
    enabled: search !== null,
  });
  const isFull = savedIds.length >= MAX_THEATRES;

  const handleUseLocation = async () => {
    const request = locationRequest.current + 1;
    locationRequest.current = request;
    setIsLocating(true);
    setLocationError(null);
    try {
      const position = await getCurrentCoordinates();
      if (locationRequest.current === request) {
        setCoordinates(position);
        setQuery('');
      }
    } catch (error) {
      if (locationRequest.current === request) {
        setLocationError(
          getErrorMessage(error, 'We couldn’t find your location just now.'),
        );
      }
    } finally {
      if (locationRequest.current === request) {
        setIsLocating(false);
      }
    }
  };

  const errorCode =
    results.error instanceof FirebaseError ? results.error.code : null;

  const getEmptyState = () => {
    if (locationError)
      return `${locationError} You can search by zip code instead.`;
    if (!coordinates && trimmedQuery.length > THEATRE_SEARCH_MAX_CHARS)
      return 'That’s a bit long. Try a zip code or a city name.';
    if (!coordinates && !hasQuery)
      return 'Search by zip code or city, or use where you are right now.';
    // The debounce or the request hasn't caught up with what is typed.
    if (results.isPending || (!coordinates && debouncedQuery !== trimmedQuery))
      return 'Searching…';
    if (errorCode === 'functions/resource-exhausted')
      return 'Theater search is resting for today. Try again tomorrow.';
    if (errorCode === 'functions/failed-precondition')
      return 'Theater search isn’t set up yet. We’re on it.';
    if (results.error) return 'Theater search isn’t available right now.';
    return 'No AMC theaters turned up near there. Try another zip code or city.';
  };

  const theatres =
    search !== null && !results.error ? (results.data?.theatres ?? []) : [];
  const isShowingResults =
    theatres.length > 0 && (coordinates !== null || hasQuery);
  const area = results.data?.area ?? null;

  return (
    <div className='space-y-3'>
      <Button
        type='button'
        variant='secondary'
        rounded='full'
        className='w-full gap-2'
        loading={isLocating}
        disabled={isLocating}
        onClick={() => void handleUseLocation()}
      >
        <LocateFixed className='h-4 w-4' /> Use my current location
      </Button>
      <p className='text-muted-foreground -mt-1 text-center text-xs'>
        Only used to find theaters near you. We don't keep it.
      </p>
      <SearchInput
        value={query}
        onChange={(value) => {
          locationRequest.current += 1;
          setIsLocating(false);
          setQuery(value);
          setCoordinates(null);
          setLocationError(null);
        }}
        placeholder='Zip code or city'
      />
      {isShowingResults ? (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-sm'>
            {coordinates ? 'Near you' : area ? `Near ${area}` : 'Closest first'}
          </p>
          <ul className='border-border bg-card divide-border divide-y overflow-hidden rounded-2xl border'>
            {theatres.map((theatre) => {
              const isSaved = savedIds.includes(theatre.theatreId);
              const detail = [
                formatTheatreLocation(theatre),
                theatre.distanceMiles === null
                  ? null
                  : `${theatre.distanceMiles.toFixed(1)} mi`,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <TheaterRow
                  key={theatre.theatreId}
                  name={theatre.name}
                  detail={detail}
                  trailing={
                    isSaved ? (
                      <span className='text-muted-foreground shrink-0 text-sm'>
                        Added
                      </span>
                    ) : (
                      <Button
                        type='button'
                        size='sm'
                        variant='secondary'
                        rounded='full'
                        disabled={isDisabled || isFull}
                        onClick={() => onAdd(theatre)}
                      >
                        Add
                      </Button>
                    )
                  }
                />
              );
            })}
          </ul>
          {isFull && (
            <p className='text-muted-foreground text-sm'>
              That's {MAX_THEATRES} theaters, the most you can save. Remove one
              to add another.
            </p>
          )}
        </div>
      ) : (
        <p className='text-muted-foreground py-4 text-center text-sm'>
          {getEmptyState()}
        </p>
      )}
    </div>
  );
}

export default TheaterFinder;
