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

interface PlaceAutocompleteInputProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  bias?: PlaceSelectionBias;
  onSelect: (result: PlaceSelectionResult) => void;
  /** Fires once, after `onSelect`, when the free photo scrape of the place's Maps
   * page finishes or fails. `placeId` lets the caller ignore a stale resolution if
   * the user has since picked a different place. */
  onPhotoResolved?: (placeId: string, photoUrl: string | null) => void;
}

/**
 * A name/location text field that also offers Google Places (New) suggestions as you type.
 * Typing is free — a session token ties the keystrokes to the Details call that follows a
 * pick. Without an API key it degrades to a plain input.
 */
function PlaceAutocompleteInput({
  label,
  placeholder,
  value,
  onChange,
  bias,
  onSelect,
  onPhotoResolved,
}: PlaceAutocompleteInputProps) {
  const queryClient = useQueryClient();
  const [isTyping, setIsTyping] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState(createSessionToken);
  const containerRef = useRef<HTMLDivElement>(null);
  const trimmedValue = value.trim();
  const debouncedValue = useDebouncedValue(trimmedValue, DEBOUNCE_MS);
  const isSearchEnabled = isPlacesSearchAvailable();

  const suggestionsQuery = useQuery({
    ...placeAutocompleteQueryOptions(debouncedValue, sessionToken, bias),
    enabled:
      isSearchEnabled &&
      isTyping &&
      debouncedValue === trimmedValue &&
      debouncedValue.length >= MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
  });
  const suggestions =
    isTyping && trimmedValue.length >= MIN_QUERY_LENGTH ? (suggestionsQuery.data ?? []) : [];
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

  const handleSelect = async (suggestion: PlaceSuggestion) => {
    setIsOpen(false);
    setIsTyping(false);
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

  const error = selectError ?? (suggestionsQuery.isError ? 'Place search failed.' : null);

  return (
    <div ref={containerRef} className='relative space-y-1.5'>
      <Label>{label}</Label>
      <Input
        placeholder={placeholder}
        value={value}
        disabled={isResolving}
        autoComplete='off'
        onChange={(event) => {
          onChange(event.target.value);
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

export default PlaceAutocompleteInput;
