import { useQuery } from '@tanstack/react-query';

import { DEBOUNCE_MS, useDebouncedValue } from '@/hooks/useDebounce';
import type { PageContent } from '@/lib/pageContent/fetchPageContent';
import type { pageContentQueryOptions } from '@/lib/pageContent/pageContentQueries';
import { toWebLink } from '@/utils/urlUtils';

const MAX_TITLE_CHARS = 120;
const MAX_SITE_NAME_CHARS = 120;
const MAX_DESCRIPTION_CHARS = 300;
const MAX_IMAGE_URL_CHARS = 2000;

export interface PageLinkPreview {
  url: string;
  host: string;
  title: string | null;
  siteName: string | null;
  description: string | null;
  /** An https address on someone else's site; load it through `FallbackImage`. */
  imageUrl: string | null;
}

interface UseLinkPreviewOptions {
  /** The page request to read; pass the one a reading of the same link will make, so the preview and that reading share one fetch and one cache entry. */
  getQueryOptions: (url: string) => ReturnType<typeof pageContentQueryOptions>;
  /** False holds the lookup back (a link the person did not just paste). */
  isEnabled?: boolean;
}

const clip = (value: string | null | undefined, limit: number) =>
  value?.trim().slice(0, limit) || null;

const toPreview = (url: string, page: PageContent): PageLinkPreview => {
  const image = page.meta?.image ? toWebLink(page.meta.image) : null;
  return {
    url,
    host: new URL(url).hostname.replace(/^www\./i, ''),
    title: clip(page.title, MAX_TITLE_CHARS),
    siteName: clip(page.meta?.siteName, MAX_SITE_NAME_CHARS),
    description: clip(page.meta?.description, MAX_DESCRIPTION_CHARS),
    imageUrl:
      image?.startsWith('https://') && image.length <= MAX_IMAGE_URL_CHARS
        ? image
        : null,
  };
};

/**
 * What a pasted link points at, or null until it is certain: the text is a whole web link, typing has paused on it
 * and its page has been read. There is no loading or failed state to draw, so a card built from this never flashes.
 */
export function useLinkPreview(
  text: string,
  { getQueryOptions, isEnabled = true }: UseLinkPreviewOptions,
): PageLinkPreview | null {
  const settledText = useDebouncedValue(text, DEBOUNCE_MS.linkDetection);
  const typedLink = toWebLink(text);
  const url =
    typedLink !== null && typedLink === toWebLink(settledText)
      ? typedLink
      : null;
  const lookup = useQuery({
    ...getQueryOptions(url ?? ''),
    enabled: url !== null && isEnabled,
  });

  const preview =
    url !== null && lookup.data ? toPreview(url, lookup.data) : null;
  return preview;
}
