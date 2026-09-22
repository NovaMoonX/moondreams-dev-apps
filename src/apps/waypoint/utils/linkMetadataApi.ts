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

/** Calls the fetchLinkMetadata cloud function once for a given URL. Used both for
 * the URL-attachment fallback and, with a place's Maps URL, as the free photo
 * source right after a Places pick (see placesApi.ts). Callers are responsible for
 * only calling this at pick/attach time or on an explicit refresh — never on
 * render — per the "fetch once, store, refresh only when necessary" cost rule. */
export async function fetchLinkMetadata(url: string): Promise<FetchedLinkMetadata> {
  const result = await fetchLinkMetadataCallable({ url });
  return result.data;
}
