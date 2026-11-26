import { useQueries } from '@tanstack/react-query';

import { useStorageImageUrl } from '@apps/pinch/hooks/useStorageImageUrl';
import { storageImageQueryOptions } from '@apps/pinch/queries/storageImageQueries';

/** The download URL of one of a cook's photos, or null while it loads, when there is none, or when it can't be read. A photo's path is new for every upload, so it never needs a version. */
export function useCookPhotoUrl(path: string | null) {
  return useStorageImageUrl(path, 0);
}

/** Each of a cook's photos with its download URL, in the cook's order; a URL is null while it loads or when it can't be read. */
export function useCookPhotoUrls(paths: string[]) {
  const results = useQueries({
    queries: paths.map((path) => storageImageQueryOptions(path, 0)),
  });

  return paths.map((path, index) => ({
    id: path,
    url: results[index]?.data ?? null,
  }));
}
