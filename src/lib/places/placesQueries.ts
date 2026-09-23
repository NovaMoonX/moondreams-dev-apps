import { queryOptions } from '@tanstack/react-query';

import { DAY_MS } from '@/lib/query/queryClient';
import { normalizeString } from '@/utils/stringUtils';

import { autocomplete, getPlaceForSelection } from './placesApi';
import type { PlaceSelectionBias } from './types';

// Google matches case- and whitespace-insensitively and a 50km bias barely moves over
// ~1km, so both are normalized in the key to let near-identical searches share a result.
function roundBias(bias?: PlaceSelectionBias) {
  return bias
    ? { latitude: Number(bias.latitude.toFixed(2)), longitude: Number(bias.longitude.toFixed(2)) }
    : null;
}

// The session token only groups billing, so it's deliberately left out of the keys: a
// repeated search or re-picked place is served from cache instead of billed again.
export const placesQueryKeys = {
  all: ['places'] as const,
  autocomplete: (input: string, bias?: PlaceSelectionBias) =>
    [...placesQueryKeys.all, 'autocomplete', normalizeString(input), roundBias(bias)] as const,
  details: (placeId: string) => [...placesQueryKeys.all, 'details', placeId] as const,
};

export function placeAutocompleteQueryOptions(
  input: string,
  sessionToken: string,
  bias?: PlaceSelectionBias,
) {
  return queryOptions({
    queryKey: placesQueryKeys.autocomplete(input, bias),
    queryFn: () => autocomplete(normalizeString(input), sessionToken, roundBias(bias) ?? undefined),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
    meta: { persist: true },
  });
}

export function placeDetailsQueryOptions(placeId: string, name: string, sessionToken: string) {
  return queryOptions({
    queryKey: placesQueryKeys.details(placeId),
    queryFn: () => getPlaceForSelection(placeId, name, sessionToken),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
    meta: { persist: true },
  });
}
