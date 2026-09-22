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

/** The best link to send someone to learn more about this item: the attached
 * booking/listing link if there is one, otherwise the place's Google Maps page. */
export function getDisplayLink(item: {
  place?: PlaceRef | null;
  linkUrl?: string | null;
}): string | null {
  return item.linkUrl ?? item.place?.mapsUrl ?? null;
}
