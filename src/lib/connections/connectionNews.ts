import { updateConnection } from '@/lib/connections/connectionCalls';
import type { ConnectionGrantWithId } from '@/lib/connections/useConnections';
import { readUnseenNews, toSeenScopes } from '@/lib/connections/newReads';
import { getConnectorManifest } from '@/lib/connections/sources';

/** Whether a connection reads something recently added that the person hasn't seen. */
export const hasUnseenNews = (grant: ConnectionGrantWithId, now: number) =>
  Object.keys(
    readUnseenNews(
      getConnectorManifest(grant.connectorId),
      grant.categories,
      now,
    ),
  ).length > 0;

const openedNews = new Map<string, ReturnType<typeof readUnseenNews>>();

/** What was new on a connection when the person tapped into it, since that tap marks it seen before the page's listener loads. */
export const readOpenedNews = (grantId: string) =>
  openedNews.get(grantId) ?? null;

/** Drops one category from what a tap handed over, once the person has seen it on the page. */
export const forgetOpenedNews = (grantId: string, categoryId: string) => {
  const news = openedNews.get(grantId);
  if (news === undefined) return;
  openedNews.set(
    grantId,
    Object.fromEntries(
      Object.entries(news).filter(([id]) => id !== categoryId),
    ),
  );
};

/** Records that the person has now seen what is new on these connections; opening one counts as seeing it. */
export const markNewsSeen = (grants: ConnectionGrantWithId[], now: number) =>
  Promise.all(
    grants.flatMap((grant) => {
      const manifest = getConnectorManifest(grant.connectorId);
      const news = readUnseenNews(manifest, grant.categories, now);
      openedNews.set(grant.id, news);
      if (Object.keys(news).length === 0) return [];
      return [
        updateConnection({
          grantId: grant.id,
          seenScopes: toSeenScopes(manifest, news),
        }),
      ];
    }),
  );
