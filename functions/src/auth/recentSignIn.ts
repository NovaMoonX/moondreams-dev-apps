export const RECENT_SIGN_IN_MS = 5 * 60 * 1000;

/** Whether a token's `auth_time` (seconds) is within the recent sign-in window. */
export const isSignInRecent = (authTimeSeconds: unknown, now: number) =>
  typeof authTimeSeconds === 'number' &&
  now - authTimeSeconds * 1000 <= RECENT_SIGN_IN_MS;
