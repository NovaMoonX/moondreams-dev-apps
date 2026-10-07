import { queryOptions } from '@tanstack/react-query';

import { queryClient } from '@/lib/query/queryClient';
import { findTopPlace } from '@/lib/places/placesLookup';
import type { PlaceSelectionBias } from '@/lib/places/types';
import { normalizeString } from '@/utils/stringUtils';
import { waypointQueryKeys } from '@apps/waypoint/queries/tripTitleQueries';

const LOOKUP_TIMEOUT_MS = 4000;

const timeout = () =>
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Place lookup timed out.')), LOOKUP_TIMEOUT_MS));

export function ideaPlaceQueryOptions(title: string, bias?: PlaceSelectionBias) {
  return queryOptions({
    queryKey: [...waypointQueryKeys.all, 'ideaPlace', normalizeString(title), bias ?? null] as const,
    queryFn: () => Promise.race([findTopPlace(queryClient, title, bias), timeout()]),
    retry: false,
  });
}
