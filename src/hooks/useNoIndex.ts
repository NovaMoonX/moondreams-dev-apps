import { useEffect } from 'react';

const PRIVATE_PAGE_META = [
  { name: 'robots', content: 'noindex, nofollow' },
  { name: 'referrer', content: 'no-referrer' },
];

/**
 * Asks search engines not to list the page or follow its links, and browsers not to send its address as the referrer of anything it opens or loads, while it is mounted. For pages that show someone's data behind a link.
 * Pair it with a `pages` entry in `cloudflare-worker.js`, which sends the same two requests as headers for crawlers and first loads that don't run JS.
 */
export function useNoIndex() {
  useEffect(() => {
    const tags = PRIVATE_PAGE_META.map(({ name, content }) => {
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
      return meta;
    });
    return () => tags.forEach((meta) => meta.remove());
  }, []);
}
