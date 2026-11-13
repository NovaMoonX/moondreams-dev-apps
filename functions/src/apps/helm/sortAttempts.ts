export const MAX_ATTEMPTS = 3;

/** A provider answer that says nothing about the capture itself (busy, down, slow) gives the attempt back. */
export const isTransientCode = (code: string) =>
  code === 'timeout' ||
  code === 'network' ||
  code === 'http429' ||
  /^http5\d\d$/.test(code);

/** The attempts a claim records, or null when the capture has none left. */
export const claimAttempts = (attempts: number) =>
  attempts >= MAX_ATTEMPTS ? null : attempts + 1;

/** Where a capture lands after a failed try: the claim's attempt stays counted or is given back. */
export const settleAttempts = (claimed: number, countsAttempt: boolean) => {
  const attempts = Math.max(0, claimed - (countsAttempt ? 0 : 1));
  return {
    attempts,
    status:
      attempts >= MAX_ATTEMPTS ? ('failed' as const) : ('received' as const),
  };
};

/** A stored answer belongs to the capture it was made for; a request key reused for another capture is a new request. */
export const readStoredResult = <Result>(
  stored: { captureId?: unknown; result?: Result } | undefined,
  captureId: string,
): Result | null =>
  stored?.captureId === captureId ? (stored.result ?? null) : null;

/** What a failed "sort the rest" call writes: back to the person's question, with the failure's code unless the caller overrides it. */
export const restFailureFields = (
  code: string,
  extra: Record<string, unknown> = {},
) => ({
  status: 'needsYou' as const,
  lastErrorCode: code,
  claimId: null,
  claimedAt: null,
  ...extra,
});
