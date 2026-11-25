import { isRunningInEmulator } from './emulator.js';

const ALLOWED_ORIGINS: (string | RegExp)[] = [
  'https://apps.moondreams.dev',
  /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
];

/** The pages a browser-called HTTP function answers; the dev server and a phone on the LAN load over plain HTTP from any host. */
export const SERVED_ORIGINS: (string | RegExp)[] = isRunningInEmulator()
  ? [...ALLOWED_ORIGINS, /^http:\/\/[^/]+:\d+$/]
  : ALLOWED_ORIGINS;

export const isServedOrigin = (
  origin: string | undefined,
  allowedOrigins: readonly (string | RegExp)[],
) =>
  origin !== undefined &&
  allowedOrigins.some((entry) =>
    typeof entry === 'string' ? entry === origin : entry.test(origin),
  );
