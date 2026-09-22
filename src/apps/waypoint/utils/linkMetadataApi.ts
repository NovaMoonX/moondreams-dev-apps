import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/config';
import type { LinkPreview } from '@apps/waypoint/types';

export interface FetchedLinkMetadata extends LinkPreview {
  mapsPlace: { name: string; latitude: number; longitude: number } | null;
}

const fetchLinkMetadataCallable = httpsCallable<{ url: string }, FetchedLinkMetadata>(
  functions,
  'fetchLinkMetadata',
);

/** Fetches link preview metadata once for a given URL. Used both for the
 * URL-attachment fallback and, with a place's Maps URL, as a free photo source
 * right after a Places pick. Callers must only call this at pick/attach time or
 * on an explicit refresh, never on render — each call is billed/rate-limited work
 * on the other end, not a cache lookup. */
export async function fetchLinkMetadata(url: string): Promise<FetchedLinkMetadata> {
  const result = await fetchLinkMetadataCallable({ url });
  return result.data;
}
