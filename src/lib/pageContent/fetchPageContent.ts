import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/config';

export type PageContentKind =
  'text' | 'structuredData' | 'meta' | 'headings' | 'images';

export interface PageContentRequest {
  url: string;
  /** Which kinds of content to read; the page's text and meta tags when omitted. */
  include?: PageContentKind[];
  /** Keeps only the schema.org nodes of these types (`['Recipe']`, `['Product']`); every node when omitted. */
  schemaTypes?: string[];
  /** Caps the page text; the function clamps it to its own limits. */
  maxTextChars?: number;
}

export interface PageMeta {
  description: string | null;
  /** An absolute web address; load it through `FallbackImage`. */
  image: string | null;
  siteName: string | null;
  author: string | null;
}

/** A page's content: `url` and `title` always, and only the kinds asked for. */
export interface PageContent {
  url: string;
  title: string | null;
  text?: string;
  structuredData?: Record<string, unknown>[];
  meta?: PageMeta;
  headings?: string[];
  /** Absolute web addresses of the page's images; load them through `FallbackImage`. */
  images?: string[];
}

const fetchPageContentCallable = httpsCallable<PageContentRequest, PageContent>(
  functions,
  'fetchPageContent',
);

/** Raw callable: call through `pageContentQueryOptions` so a repeat of the same request isn't fetched twice. */
export async function fetchPageContent(
  request: PageContentRequest,
): Promise<PageContent> {
  const result = await fetchPageContentCallable(request);
  return result.data;
}
