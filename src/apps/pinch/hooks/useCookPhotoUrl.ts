import { useStorageImageUrl } from '@apps/pinch/hooks/useStorageImageUrl';
import type { Cook } from '@apps/pinch/types';

/** The download URL of a cook's photo, or null while it loads, when there is none, or when it can't be read. A photo's path is new for every upload, so it never needs a version. */
export function useCookPhotoUrl(cook: Pick<Cook, 'photoPath'> | null) {
  return useStorageImageUrl(cook?.photoPath ?? null, 0);
}
