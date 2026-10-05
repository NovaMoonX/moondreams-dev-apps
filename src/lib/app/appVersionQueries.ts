import { queryOptions } from '@tanstack/react-query';

const FETCH_TIMEOUT_MS = 6000;

export const fetchLatestVersion = async () => {
  const [{ get, ref }, { realtimeDb }] = await Promise.all([
    import('firebase/database'),
    import('@lib/firebase/config'),
  ]);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS));
  const snapshot = await Promise.race([get(ref(realtimeDb, 'appVersion')), timeout]);
  const value = snapshot?.val();
  return typeof value === 'string' ? value : null;
};

export const latestVersionQueryOptions = () =>
  queryOptions({
    queryKey: ['app', 'latestVersion'] as const,
    queryFn: fetchLatestVersion,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
