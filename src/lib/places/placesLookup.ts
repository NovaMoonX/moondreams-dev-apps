import type { QueryClient } from '@tanstack/react-query';

import { createSessionToken, isPlacesSearchAvailable } from './placesApi';
import { placeAutocompleteQueryOptions, placeDetailsQueryOptions } from './placesQueries';
import type { PlaceSelectionBias, PlaceSelectionResult } from './types';

/** Runs a place search and resolves the top result, as if the user had typed the query and
 * picked the first suggestion. `null` when search is unavailable or nothing matches. */
export async function findTopPlace(
  queryClient: QueryClient,
  query: string,
  bias?: PlaceSelectionBias,
  primaryTypes?: string[],
): Promise<PlaceSelectionResult | null> {
  if (!isPlacesSearchAvailable() || !query.trim()) {
    return null;
  }

  const sessionToken = createSessionToken();
  const suggestions = await queryClient.fetchQuery(
    placeAutocompleteQueryOptions(query, sessionToken, bias, primaryTypes),
  );
  const top = suggestions[0];
  if (!top) {
    return null;
  }

  const result = await queryClient.fetchQuery(
    placeDetailsQueryOptions(top.placeId, top.primaryText, sessionToken),
  );
  return result;
}
