import { queryOptions } from '@tanstack/react-query';
import { getDownloadURL, ref } from 'firebase/storage';

import { storage } from '@/lib/firebase/config';

export const storageImageKeys = {
  all: ['pinch', 'storageImage'] as const,
  one: (imagePath: string, version: number) =>
    ['pinch', 'storageImage', imagePath, version] as const,
};

/** The download URL of a person's own image (a store's, a recipe's cover); the version is the store's `updatedAt`, so replacing the image fetches a new one. */
export const storageImageQueryOptions = (imagePath: string, version: number) =>
  queryOptions({
    queryKey: storageImageKeys.one(imagePath, version),
    queryFn: () => getDownloadURL(ref(storage, imagePath)),
    staleTime: Infinity,
    retry: false,
  });
