import { queryOptions } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/config';
import { PHOTO_LOOKUP_TIMEOUT_MS } from '@apps/pinch/constants';
import { getPhotoQueryKey, toWebPhotos } from '@apps/pinch/utils/recipeCover';

const searchRecipeImagesCallable = httpsCallable<
  { query: string },
  { results: unknown }
>(functions, 'searchRecipeImages', { timeout: PHOTO_LOOKUP_TIMEOUT_MS });

export const webPhotoKeys = {
  all: ['pinch', 'webPhotos'] as const,
  search: (query: string) =>
    ['pinch', 'webPhotos', getPhotoQueryKey(query)] as const,
};

// Never persisted: the addresses are third-party.

export const webPhotosQueryOptions = (query: string) =>
  queryOptions({
    queryKey: webPhotoKeys.search(query),
    queryFn: async () => {
      const { data } = await searchRecipeImagesCallable({ query });
      return toWebPhotos(data.results);
    },
    staleTime: 30 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });
