import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/config';

export interface PageContent {
  url: string;
  title: string | null;
  /** The page's schema.org Recipe data as JSON, when it publishes any. */
  structured: string | null;
  /** The page's visible text, capped. */
  text: string;
}

const fetchPageContentCallable = httpsCallable<{ url: string }, PageContent>(
  functions,
  'fetchPageContent',
);

/** Raw callable: call through `pageContentQueryOptions` so a repeat of the same link isn't fetched twice. */
export async function fetchPageContent(url: string): Promise<PageContent> {
  const result = await fetchPageContentCallable({ url });
  return result.data;
}
