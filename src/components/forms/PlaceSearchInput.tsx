import { useEffect, useRef, useState } from 'react';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { linkMetadataQueryOptions } from '@/lib/linkMetadata/linkMetadataQueries';
import { createSessionToken, isPlacesSearchAvailable } from '@/lib/places/placesApi';
import { placeAutocompleteQueryOptions, placeDetailsQueryOptions } from '@/lib/places/placesQueries';
import type { PlaceSelectionBias, PlaceSelectionResult, PlaceSuggestion } from '@/lib/places/types';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

interface PlaceSearchInputProps {
  bias?: PlaceSelectionBias;
  onSelect: (result: PlaceSelectionResult) => void;
  /** Fires once, after `onSelect`, when the free photo scrape of the place's Maps
   * page finishes or fails. `placeId` lets the caller ignore a stale resolution if
   * the user has since picked a different place. */
  onPhotoResolved?: (placeId: string, photoUrl: string | null) => void;
}

/**
 * Google Places (New) type-ahead. Typing is free — a session token ties the
 * keystrokes to the Details call that follows a pick, so they aren't billed on
 * their own. Hidden entirely when no API key is configured, so the surrounding
 * form still works without one.
 */
function PlaceSearchInput({ bias, onSelect, onPhotoResolved }: PlaceSearchInputProps) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState(createSessionToken);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), DEBOUNCE_MS);

  const suggestionsQuery = useQuery({
    ...placeAutocompleteQueryOptions(debouncedQuery, sessionToken, bias),
    enabled:
      isPlacesSearchAvailable() &&
      isTyping &&
      debouncedQuery === query.trim() &&
      debouncedQuery.length >= MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
  });
  const suggestions = isTyping && query.trim().length >= MIN_QUERY_LENGTH
    ? (suggestionsQuery.data ?? [])
    : [];
  const isSearching = suggestionsQuery.isFetching && suggestions.length === 0;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isPlacesSearchAvailable()) {
    return null;
  }

  const handleSelect = async (suggestion: PlaceSuggestion) => {
    setIsOpen(false);
    setIsTyping(false);
    setQuery(suggestion.primaryText);
    setIsResolving(true);
    setSelectError(null);
    try {
      const result = await queryClient.fetchQuery(
        placeDetailsQueryOptions(suggestion.placeId, suggestion.primaryText, sessionToken),
      );
      if (result) {
        onSelect(result);
        // Free photo source (a scrape of the Maps page, not the billed Places
        // Photo SKU) — fire-and-forget so the rest of the form is usable right
        // away; a failure just leaves the place without a photo.
        queryClient
          .fetchQuery(linkMetadataQueryOptions(result.place.mapsUrl))
          .then((metadata) => {
            const photoUrl =
              metadata.imageUrl && metadata.imageUrl.includes('googleusercontent.com')
                ? metadata.imageUrl
                : null;
            onPhotoResolved?.(suggestion.placeId, photoUrl);
          })
          .catch(() => onPhotoResolved?.(suggestion.placeId, null));
      } else {
        setSelectError("Couldn't load that place. Try another result.");
      }
    } catch {
      setSelectError("Couldn't load that place. Try another result.");
    } finally {
      // A pick closes the session — the next search opens a new one.
      setSessionToken(createSessionToken());
      setIsResolving(false);
    }
  };

  const error = selectError ?? (suggestionsQuery.isError ? 'Search failed. Try again.' : null);

  return (
    <div ref={containerRef} className='relative space-y-1.5'>
      <Label>Search for a place</Label>
      <Input
        placeholder='Search by name or address'
        value={query}
        disabled={isResolving}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsTyping(true);
          setIsOpen(true);
          setSelectError(null);
        }}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
      />
      {isOpen && (suggestions.length > 0 || isSearching) && (
        <div className='border-border bg-popover absolute z-10 mt-1 w-full rounded-md border shadow-md'>
          {isSearching ? (
            <p className='text-muted-foreground px-3 py-2 text-sm'>Searching…</p>
          ) : (
            <ul>
              {suggestions.map((suggestion) => (
                <li key={suggestion.placeId}>
                  <Button
                    type='button'
                    variant='tertiary'
                    className='h-auto w-full flex-col items-start gap-0 rounded-none px-3 py-2 text-left font-normal'
                    onClick={() => void handleSelect(suggestion)}
                  >
                    <span className='text-sm font-medium'>{suggestion.primaryText}</span>
                    {suggestion.secondaryText && (
                      <span className='text-muted-foreground text-xs'>
                        {suggestion.secondaryText}
                      </span>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className='text-muted-foreground border-border border-t px-3 py-1.5 text-right text-[10px]'>
            Powered by Google
          </p>
        </div>
      )}
      {error && <p className='text-destructive text-sm'>{error}</p>}
    </div>
  );
}

export default PlaceSearchInput;
