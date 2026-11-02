import { queryOptions, useQueries } from '@tanstack/react-query';
import { getDownloadURL, ref } from 'firebase/storage';

import { storage } from '@/lib/firebase/config';
import type { PublicPhoto } from '@apps/going-once/types';

/** A copy's address never changes (each has its own name and token), so it is read once; a copy that isn't readable yet stays null. */
const copyUrlQueryOptions = (path: string) =>
  queryOptions({
    queryKey: ['going-once', 'publicCopyUrl', path] as const,
    queryFn: () => getDownloadURL(ref(storage, path)),
    staleTime: Infinity,
    retry: 1,
  });

/** The addresses of one size of a thing's public copies, in the thing's order; `url` is null until one arrives, and `isMissing` says it could not be found. */
export function usePublicPhotoUrls(
  photos: PublicPhoto[],
  size: keyof PublicPhoto,
): { id: string; url: string | null; isMissing: boolean }[] {
  return useQueries({
    queries: photos.map((photo) => copyUrlQueryOptions(photo[size])),
    combine: (results) =>
      results.map((result, index) => ({
        id: photos[index][size],
        url: result.data ?? null,
        isMissing: result.isError,
      })),
  });
}
