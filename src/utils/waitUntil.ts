export interface WaitUntilOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

/** Resolves true once `check` passes, or false after the timeout; never throws, so a change already made is never reported as failed. */
export const waitUntil = async (
  check: () => boolean,
  { timeoutMs = 4000, intervalMs = 100 }: WaitUntilOptions = {},
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  const poll = async (): Promise<boolean> => {
    if (check()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    return poll();
  };
  return poll();
};
