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

export type VersionStatus = 'latest' | 'outdated' | 'ahead' | 'unknown';

const compareVersions = (a: string, b: string) => {
  const [pa, pb] = [a, b].map((v) => v.split('.').map((n) => Number.parseInt(n, 10) || 0));
  return [0, 1, 2].map((i) => (pa[i] ?? 0) - (pb[i] ?? 0)).find((d) => d !== 0) ?? 0;
};

/** How a running build compares to the published one; a local `dev` build counts as ahead. */
export const getVersionStatus = (current: string, latest: string | null): VersionStatus => {
  if (!latest) return 'unknown';
  if (current === 'dev') return 'ahead';
  const diff = compareVersions(current, latest);
  if (diff === 0) return 'latest';
  return diff < 0 ? 'outdated' : 'ahead';
};
