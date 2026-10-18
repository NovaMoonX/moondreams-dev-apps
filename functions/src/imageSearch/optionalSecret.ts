import { fetchCapped } from './fetchCapped.js';
import type { FetchLike } from './types.js';

const FOUND_MS = 10 * 60_000;
const ABSENT_MS = 2 * 60_000;
const MAX_SECRET_LENGTH = 512;
const MAX_BODY_BYTES = 16 * 1024;
const TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

interface SecretReaderOptions {
  fetch: FetchLike;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  timeoutMs?: number;
}

/** The environment first, then Secret Manager with the function's own credentials. Missing, denied or slow is null, so a provider that needs it is skipped; the value never reaches a log or a response. */
export function createOptionalSecretReader({
  fetch,
  env = process.env,
  now = Date.now,
  timeoutMs,
}: SecretReaderOptions) {
  const remembered = new Map<string, { value: string | null; until: number }>();

  const getAccessToken = async (signal: AbortSignal) => {
    const response = await fetchCapped({
      fetch,
      url: TOKEN_URL,
      init: { headers: { 'Metadata-Flavor': 'Google' } },
      signal,
      maxBytes: MAX_BODY_BYTES,
      timeoutMs,
    });
    const token = (JSON.parse(response.text) as { access_token?: unknown })
      .access_token;
    return response.status === 200 && typeof token === 'string' ? token : null;
  };

  const readFromSecretManager = async (
    name: string,
    signal: AbortSignal,
  ): Promise<string | null> => {
    const project = env.GCLOUD_PROJECT ?? env.GCP_PROJECT;
    const token = project ? await getAccessToken(signal) : null;
    if (!project || token === null) return null;
    const response = await fetchCapped({
      fetch,
      url: `https://secretmanager.googleapis.com/v1/projects/${encodeURIComponent(project)}/secrets/${encodeURIComponent(name)}/versions/latest:access`,
      init: {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
      },
      signal,
      maxBytes: MAX_BODY_BYTES,
      timeoutMs,
    });
    const data = (JSON.parse(response.text) as { payload?: { data?: unknown } })
      .payload?.data;
    return response.status === 200 && typeof data === 'string'
      ? Buffer.from(data, 'base64').toString('utf8').trim()
      : null;
  };

  return async (name: string, signal: AbortSignal): Promise<string | null> => {
    const cached = remembered.get(name);
    if (cached && cached.until > now()) return cached.value;

    const fromEnv = env[name]?.trim() ?? '';
    const found =
      fromEnv !== ''
        ? fromEnv
        : await readFromSecretManager(name, signal).catch(() => null);
    const value =
      found !== null && found !== '' && found.length <= MAX_SECRET_LENGTH
        ? found
        : null;
    remembered.set(name, {
      value,
      until: now() + (value === null ? ABSENT_MS : FOUND_MS),
    });
    return value;
  };
}
