/** True when a failed write was the connection's fault, so the sentence can say to try again online. */
export const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');
