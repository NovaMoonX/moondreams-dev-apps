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

/** Records that the person has now seen what is new on these connections; opening one counts as seeing it. */
export const markNewsSeen = (grants: ConnectionGrantWithId[], now: number) =>
  Promise.all(
    grants.flatMap((grant) => {
      const manifest = getConnectorManifest(grant.connectorId);
      const news = readUnseenNews(manifest, grant.categories, now);
      if (Object.keys(news).length === 0) return [];
      return [
        updateConnection({
          grantId: grant.id,
          seenScopes: toSeenScopes(manifest, news),
        }),
      ];
    }),
  );
