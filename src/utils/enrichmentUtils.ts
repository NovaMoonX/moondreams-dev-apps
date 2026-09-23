import type { LinkPreview } from '@/lib/linkMetadata/types';
import type { PlaceRef } from '@/lib/places/types';

/** A photo the user attached on purpose (via a link preview) wins over the photo we
 * scraped automatically when they picked a place. */
export function getDisplayImage(item: {
  place?: PlaceRef | null;
  linkPreview?: LinkPreview | null;
}): string | null {
  return item.linkPreview?.imageUrl ?? item.place?.photoUrl ?? null;
}
