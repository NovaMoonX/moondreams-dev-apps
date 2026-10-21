import { useQuery } from '@tanstack/react-query';

import { storageImageQueryOptions } from '@apps/pinch/queries/storageImageQueries';

/** The download URL of a store's own image, or null while it loads, when there is none, or when it can't be read. A replaced image (a new version of the same path) keeps showing the old one until the new URL is ready. */
export function useStorageImageUrl(imagePath: string | null, version: number) {
  const { data } = useQuery({
    ...storageImageQueryOptions(imagePath ?? '', version),
    enabled: imagePath !== null,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === imagePath ? previous : undefined,
  });

  return imagePath === null ? null : (data ?? null);
}
