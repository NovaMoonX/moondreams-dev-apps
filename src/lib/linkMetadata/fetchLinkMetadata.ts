import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/config';
import type { FetchedLinkMetadata } from './types';

const fetchLinkMetadataCallable = httpsCallable<{ url: string }, FetchedLinkMetadata>(
  functions,
  'fetchLinkMetadata',
);

/** Raw callable — call through `linkMetadataQueryOptions` (./linkMetadataQueries) so repeat URLs hit the cache. */
export async function fetchLinkMetadata(url: string): Promise<FetchedLinkMetadata> {
  const result = await fetchLinkMetadataCallable({ url });
  return result.data;
}
