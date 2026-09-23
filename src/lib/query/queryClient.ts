import { QueryClient } from '@tanstack/react-query';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Shared cache for one-shot request/response calls (third-party APIs, callables, single
 * Firestore reads). Live Firestore data stays on onSnapshot listeners + Redux, so there's
 * no focus/reconnect refetching here. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});
