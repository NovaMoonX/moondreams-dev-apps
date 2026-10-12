import { queryOptions } from '@tanstack/react-query';
import { getDownloadURL, ref } from 'firebase/storage';

import { storage } from '@/lib/firebase/config';

export const storeImageKeys = {
  all: ['pinch', 'storeImage'] as const,
  one: (imagePath: string, version: number) =>
    ['pinch', 'storeImage', imagePath, version] as const,
};

/** The download URL of a store's own image; the version is the store's `updatedAt`, so replacing the image fetches a new one. */
export const storeImageQueryOptions = (imagePath: string, version: number) =>
  queryOptions({
    queryKey: storeImageKeys.one(imagePath, version),
    queryFn: () => getDownloadURL(ref(storage, imagePath)),
    staleTime: Infinity,
    retry: false,
  });
