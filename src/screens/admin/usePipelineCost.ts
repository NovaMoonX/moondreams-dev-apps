import { queryOptions, useQuery } from '@tanstack/react-query';

import { ADMIN_QUERY_KEY } from '@lib/admin/adminQueries';
import { fetchPipelineCosts } from '@/store/listeners/pipelineListeners';

import { LOAD_DAYS } from './pipelineCost';

const DAY_MS = 86_400_000;

/** One-shot, like the rest of the dashboard's reports, so the refresh button re-reads it with them. */
const pipelineCostQueryOptions = () =>
  queryOptions({
    queryKey: [...ADMIN_QUERY_KEY, 'pipelineCost'] as const,
    queryFn: () => fetchPipelineCosts(Date.now() - LOAD_DAYS * DAY_MS),
    staleTime: 60_000,
  });

export const usePipelineCost = () => useQuery(pipelineCostQueryOptions());
