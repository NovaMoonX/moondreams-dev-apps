import { useQuery } from '@tanstack/react-query';

import { storageImageQueryOptions } from '@apps/pinch/queries/storageImageQueries';

/** The download URL of a store's own image, or null while it loads, when there is none, or when it can't be read. */
export function useStorageImageUrl(imagePath: string | null, version: number) {
  const { data } = useQuery({
    ...storageImageQueryOptions(imagePath ?? '', version),
    enabled: imagePath !== null,
  });

  return imagePath === null ? null : (data ?? null);
}
