import { queryOptions } from '@tanstack/react-query';

import { autocomplete, getPlaceForSelection } from './placesApi';
import type { PlaceSelectionBias } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

// The session token only groups billing, so it's deliberately left out of the keys: a
// repeated search or re-picked place is served from cache instead of billed again.
export const placesQueryKeys = {
  all: ['places'] as const,
  autocomplete: (input: string, bias?: PlaceSelectionBias) =>
    [...placesQueryKeys.all, 'autocomplete', input, bias ?? null] as const,
  details: (placeId: string) => [...placesQueryKeys.all, 'details', placeId] as const,
};

export function placeAutocompleteQueryOptions(
  input: string,
  sessionToken: string,
  bias?: PlaceSelectionBias,
) {
  return queryOptions({
    queryKey: placesQueryKeys.autocomplete(input, bias),
    queryFn: () => autocomplete(input, sessionToken, bias),
    staleTime: DAY_MS,
  });
}

export function placeDetailsQueryOptions(placeId: string, name: string, sessionToken: string) {
  return queryOptions({
    queryKey: placesQueryKeys.details(placeId),
    queryFn: () => getPlaceForSelection(placeId, name, sessionToken),
    staleTime: DAY_MS,
  });
}
