import { queryOptions, useQueries } from '@tanstack/react-query';
import { getDownloadURL, ref } from 'firebase/storage';

import { storage } from '@/lib/firebase/config';
import type { ItemPhoto } from '@apps/going-once/types';

/** A photo's address never changes (every upload has its own name), so it is read once. */
const itemPhotoUrlQueryOptions = (path: string) =>
  queryOptions({
    queryKey: ['going-once', 'itemPhotoUrl', path] as const,
    queryFn: () => getDownloadURL(ref(storage, path)),
    staleTime: Infinity,
    retry: 2,
  });

/** The addresses of a thing's photos in their order; `url` is null until one arrives. */
export function useItemPhotoUrls(
  photos: ItemPhoto[],
): { id: string; url: string | null }[] {
  return useQueries({
    queries: photos.map((photo) => itemPhotoUrlQueryOptions(photo.path)),
    combine: (results) =>
      results.map((result, index) => ({
        id: photos[index].id,
        url: result.data ?? null,
      })),
  });
}
