import { useQueries } from '@tanstack/react-query';

import { appUsageQueryOptions } from '@lib/appUsage/appUsageQueries';
import type { AppMetadata } from '@lib/types/appCatalog';

/** Every app's usage records, one shared read per app (the same key the Usage view reads, so nothing is fetched twice). */
export function useAllAppUsage(apps: AppMetadata[]) {
  const queries = useQueries({ queries: apps.map((app) => appUsageQueryOptions(app.id)) });

  return {
    byAppId: Object.fromEntries(apps.map((app, index) => [app.id, queries[index]?.data])),
    failedAppIds: apps.filter((_, index) => queries[index]?.isError).map((app) => app.id),
    isLoading: queries.some((query) => query.isPending),
    hasError: queries.some((query) => query.isError),
  };
}
