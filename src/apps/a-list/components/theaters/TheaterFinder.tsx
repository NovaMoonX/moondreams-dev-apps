import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';
import { ChevronRight, LocateFixed } from 'lucide-react';

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
  THEATRE_FAR_AWAY_MILES,
  THEATRE_STATE_RESULT_CAP,
  THEATRE_SEARCH_MAX_CHARS,
  THEATRE_SEARCH_MIN_CHARS,
} from '@apps/a-list/constants';
import {
  findTheatresQueryOptions,
  type TheatreSearch,
} from '@apps/a-list/queries/theatreQueries';
import type { TheatrePlace, TheatreSearchResult } from '@apps/a-list/types';
import { formatTheatreLocation } from '@apps/a-list/utils/theatres';

interface TheaterFinderProps {
  savedIds: string[];
  onAdd: (theatre: TheatreSearchResult) => void;
  isDisabled?: boolean;
  /** The button on each result; "Link" when the pick replaces a typed theater. */
  actionLabel?: string;
}

const NO_SEARCH: TheatreSearch = { kind: 'text', query: '' };
const PLACE_KIND_LABELS: Record<TheatrePlace['kind'], string> = {
  zipcode: 'Zip code',
  city: 'City',
  state: 'State',
};

function TheaterFinder({
  savedIds,
  onAdd,
  isDisabled = false,
  actionLabel = 'Add',
}: TheaterFinderProps) {
  const [query, setQuery] = useState('');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [place, setPlace] = useState<TheatrePlace | null>(null);
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
  const isBadZip =
    !coordinates &&
    place === null &&
    /^[0-9-]+$/.test(trimmedQuery) &&
    !/^[0-9]{5}(-[0-9]{4})?$/.test(trimmedQuery);
  const getSearch = (): TheatreSearch | null => {
    if (coordinates) return { kind: 'coordinates', ...coordinates };
    if (place?.state) return { kind: 'state', state: place.state };
    if (place && place.latitude !== null && place.longitude !== null)
      return {
        kind: 'coordinates',
        latitude: place.latitude,
        longitude: place.longitude,
      };
    if (isBadZip) return null;
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
        setPlace(null);
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
      return 'That’s a bit long. Try a zip code, a city or a theater name.';
    if (isBadZip)
      return 'Zip codes are 5 digits. Keep typing, or try a city or a theater name.';
    if (!coordinates && !hasQuery)
      return 'Search by zip code, city or theater name, or use where you are right now.';
    // The debounce or the request hasn't caught up with what is typed.
    if (
      results.isPending ||
      (!coordinates && !place && debouncedQuery !== trimmedQuery)
    )
      return 'Searching…';
    if (errorCode === 'functions/invalid-argument')
      return 'Zip codes are 5 digits. Try that, a city or a theater name.';
    if (errorCode === 'functions/resource-exhausted')
      return 'Theater search is resting for today. Try again tomorrow.';
    if (errorCode === 'functions/failed-precondition')
      return 'Theater search isn’t set up yet. We’re on it.';
    if (results.error) return 'Theater search isn’t available right now.';
    if (place)
      return `AMC doesn’t have a theater near ${place.label}. Try a bigger city nearby, or a zip code.`;
    return 'No AMC theaters or places turned up for that. Try a zip code, a city or part of a theater’s name.';
  };

  const theatres =
    search !== null && !results.error ? (results.data?.theatres ?? []) : [];
  const places =
    search?.kind === 'text' && !results.error
      ? (results.data?.places ?? [])
      : [];
  const isShowingResults =
    (theatres.length > 0 || places.length > 0) &&
    (coordinates !== null || place !== null || hasQuery);
  const area = results.data?.area ?? null;
  const nearest = theatres.find((theatre) => theatre.distanceMiles !== null);
  const isFarAway =
    search?.kind === 'coordinates' &&
    place !== null &&
    (nearest?.distanceMiles ?? 0) > THEATRE_FAR_AWAY_MILES;

  const getHeading = () => {
    if (coordinates) return 'Near you';
    if (place)
      return place.kind === 'state'
        ? `In ${place.label}`
        : `Near ${place.label}`;
    if (area) return `Near ${area}`;
    return 'Theaters';
  };

  const renderTheatres = () => (
    <ul className='border-border bg-card divide-border divide-y overflow-hidden rounded-2xl border'>
      {theatres.map((theatre) => {
        const isSaved = savedIds.includes(theatre.theatreId);
        const detail = [
          formatTheatreLocation(theatre),
          theatre.distanceMiles === null || theatre.distanceMiles === 0
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
                <span className='text-muted-foreground text-sm'>Added</span>
              ) : (
                <Button
                  type='button'
                  size='sm'
                  variant='secondary'
                  rounded='full'
                  disabled={isDisabled || isFull}
                  onClick={() => onAdd(theatre)}
                >
                  {actionLabel}
                </Button>
              )
            }
          />
        );
      })}
    </ul>
  );

  const handlePickPlace = (picked: TheatrePlace) => {
    setPlace(picked);
    setQuery(picked.label);
  };

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
          setPlace(null);
          setLocationError(null);
        }}
        placeholder='Zip code, city or theater name'
      />
      {isShowingResults ? (
        <div className='space-y-4'>
          {places.length > 0 && (
            <div className='space-y-2'>
              <p className='text-muted-foreground text-sm'>Did you mean…</p>
              <ul className='border-border bg-card divide-border divide-y overflow-hidden rounded-2xl border'>
                {places.map((candidate) => (
                  <li key={`${candidate.kind}:${candidate.label}`}>
                    <Button
                      type='button'
                      variant='tertiary'
                      className='text-foreground! h-auto min-h-12 w-full justify-between! gap-3 rounded-none px-3! py-2'
                      onClick={() => handlePickPlace(candidate)}
                    >
                      <span className='min-w-0 truncate text-left'>
                        {candidate.label}
                        <span className='text-muted-foreground'>
                          {' · '}
                          {PLACE_KIND_LABELS[candidate.kind]}
                        </span>
                      </span>
                      <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {theatres.length > 0 && (
            <div className='space-y-2'>
              <p className='text-muted-foreground text-sm'>
                {places.length > 0 ? 'Theaters with that name' : getHeading()}
              </p>
              {isFarAway && (
                <p className='text-muted-foreground text-sm'>
                  AMC doesn’t have a theater in {place?.label}. The closest ones
                  are below.
                </p>
              )}
              {renderTheatres()}
              {search?.kind === 'state' &&
                theatres.length >= THEATRE_STATE_RESULT_CAP && (
                  <p className='text-muted-foreground text-sm'>
                    Showing the first {THEATRE_STATE_RESULT_CAP}. Search a city
                    to narrow it down.
                  </p>
                )}
            </div>
          )}
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
