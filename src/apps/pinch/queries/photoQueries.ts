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

/** The photos the web search finds for a recipe's title: one answer per search text, kept half an hour so reopening the drawer doesn't ask again, never persisted (the addresses are third-party). A failure is not kept as an answer: the next open asks again. */
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
