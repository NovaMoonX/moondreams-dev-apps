import { QueryClient } from '@tanstack/react-query';

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
