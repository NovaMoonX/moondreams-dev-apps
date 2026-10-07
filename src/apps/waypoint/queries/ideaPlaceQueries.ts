import { queryOptions } from '@tanstack/react-query';

import { queryClient } from '@/lib/query/queryClient';
import { findTopPlace } from '@/lib/places/placesLookup';
import type { PlaceSelectionBias } from '@/lib/places/types';
import { normalizeString } from '@/utils/stringUtils';
import { waypointQueryKeys } from '@apps/waypoint/queries/tripTitleQueries';

export function ideaPlaceQueryOptions(title: string, bias?: PlaceSelectionBias) {
  return queryOptions({
    queryKey: [...waypointQueryKeys.all, 'ideaPlace', normalizeString(title), bias ?? null] as const,
    queryFn: () => findTopPlace(queryClient, title, bias).catch(() => null),
    retry: false,
  });
}
