import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, QueryClient, type Query } from '@tanstack/react-query';
import { del, get, set } from 'idb-keyval';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const QUERY_CACHE_MAX_AGE = 7 * DAY_MS;

/** Shared cache for one-shot request/response calls (third-party APIs, callables, single
 * Firestore reads). Live Firestore data stays on onSnapshot listeners + Redux, so there's
 * no focus/reconnect refetching here. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      // A persisted query is dropped on restore once it's older than its gcTime.
      gcTime: QUERY_CACHE_MAX_AGE,
      // Firestore-backed queryFns can answer from the local cache, so let them run offline
      // instead of pausing until the browser reports a connection.
      networkMode: 'offlineFirst',
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

export const queryPersister = createAsyncStoragePersister({
  storage: { getItem: get, setItem: set, removeItem: del },
  key: 'moondreams-query-cache',
});

/** Opt a query out of disk persistence with `meta: { persist: false }`. */
export function shouldPersistQuery(query: Query) {
  return defaultShouldDehydrateQuery(query) && query.meta?.persist !== false;
}
