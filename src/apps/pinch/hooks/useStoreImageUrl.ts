import { useQuery } from '@tanstack/react-query';

import { storeImageQueryOptions } from '@apps/pinch/queries/storeImageQueries';

/** The download URL of a store's own image, or null while it loads, when there is none, or when it can't be read. */
export function useStoreImageUrl(imagePath: string | null, version: number) {
  const { data } = useQuery({
    ...storeImageQueryOptions(imagePath ?? '', version),
    enabled: imagePath !== null,
  });

  return imagePath === null ? null : (data ?? null);
}
