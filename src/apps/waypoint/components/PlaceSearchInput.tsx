import { useEffect, useRef, useState } from 'react';

import { Input, Label } from '@moondreamsdev/dreamer-ui/components';

import {
  autocomplete,
  createSessionToken,
  getPlaceForSelection,
  isPlacesSearchAvailable,
  type PlaceSelectionBias,
  type PlaceSelectionResult,
  type PlaceSuggestion,
} from '@apps/waypoint/utils/placesApi';
import { fetchLinkMetadata } from '@apps/waypoint/utils/linkMetadataApi';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

interface PlaceSearchInputProps {
  bias?: PlaceSelectionBias;
  onSelect: (result: PlaceSelectionResult) => void;
  /** Fires once, after `onSelect`, when the free photo scrape (of the place's Maps
   * page — see the cost note in placesApi.ts) finishes or fails. `placeId` lets the
   * caller ignore a stale resolution if the user has since picked a different
   * place. */
  onPhotoResolved?: (placeId: string, photoUrl: string | null) => void;
}

/**
 * Google Places (New) type-ahead. Typing is free (a session token ties the
 * keystrokes to the Details call that follows a pick, so they aren't billed on
 * their own) — see the cost notes in placesApi.ts. Hidden entirely when no API key
 * is configured, so the event/stay forms still work without one.
 */
function PlaceSearchInput({ bias, onSelect, onPhotoResolved }: PlaceSearchInputProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const runSearch = (value: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (value.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      sessionTokenRef.current ??= createSessionToken();
      setIsLoading(true);
      setError(null);
      autocomplete(value, sessionTokenRef.current, bias)
        .then((results) => {
          setSuggestions(results);
          setIsOpen(true);
        })
        .catch(() => setError('Search failed. Try again.'))
        .finally(() => setIsLoading(false));
    }, DEBOUNCE_MS);
  };

  const handleSelect = async (suggestion: PlaceSuggestion) => {
    const sessionToken = sessionTokenRef.current ?? createSessionToken();
    setIsOpen(false);
    setQuery(suggestion.primaryText);
    setIsResolving(true);
    setError(null);
    try {
      const result = await getPlaceForSelection(
        suggestion.placeId,
        suggestion.primaryText,
        sessionToken,
      );
      if (result) {
        onSelect(result);
        // Free photo source (a scrape of the Maps page, not the billed Places
        // Photo SKU) — fire-and-forget so the rest of the form is usable right
        // away; a failure just leaves the place without a photo.
        fetchLinkMetadata(result.place.mapsUrl)
          .then((metadata) => {
            const photoUrl =
              metadata.imageUrl && metadata.imageUrl.includes('googleusercontent.com')
                ? metadata.imageUrl
                : null;
            onPhotoResolved?.(suggestion.placeId, photoUrl);
          })
          .catch(() => onPhotoResolved?.(suggestion.placeId, null));
      } else {
        setError("Couldn't load that place. Try another result.");
      }
    } catch {
      setError("Couldn't load that place. Try another result.");
    } finally {
      // A pick closes the session — the next search opens a new one.
      sessionTokenRef.current = null;
      setIsResolving(false);
    }
  };

  return (
    <div ref={containerRef} className='relative space-y-1.5'>
      <Label>Search for a place</Label>
      <Input
        placeholder='Search by name or address'
        value={query}
        disabled={isResolving}
        onChange={(event) => {
          setQuery(event.target.value);
          runSearch(event.target.value);
        }}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
      />
      {isOpen && (suggestions.length > 0 || isLoading) && (
        <div className='border-border bg-popover absolute z-10 mt-1 w-full rounded-md border shadow-md'>
          {isLoading ? (
            <p className='text-muted-foreground px-3 py-2 text-sm'>Searching…</p>
          ) : (
            <ul>
              {suggestions.map((suggestion) => (
                <li key={suggestion.placeId}>
                  <button
                    type='button'
                    className='hover:bg-accent w-full px-3 py-2 text-left text-sm'
                    onClick={() => void handleSelect(suggestion)}
                  >
                    <span className='font-medium'>{suggestion.primaryText}</span>
                    {suggestion.secondaryText && (
                      <span className='text-muted-foreground block text-xs'>
                        {suggestion.secondaryText}
                      </span>
                    )}
                  </button>
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
