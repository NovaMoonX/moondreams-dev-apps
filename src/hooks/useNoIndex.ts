import { useEffect } from 'react';

/**
 * Asks search engines not to list the page while it is mounted, for pages that show someone's data behind a link.
 * Pair it with a `pages` entry in `cloudflare-worker.js`, which sends the same request as a header for crawlers that don't run JS.
 */
export function useNoIndex() {
  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);
}
