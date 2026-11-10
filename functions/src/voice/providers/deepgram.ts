const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** A short-lived token for the browser's streaming connection. Never logs or reports the key or the token. */
export async function grantDeepgramToken({
  apiKey,
  ttlSeconds,
  signal,
  fetchImpl = fetch,
}: {
  apiKey: string;
  ttlSeconds: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ token: string; expiresInSeconds: number }> {
  const res = await fetchImpl('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl_seconds: ttlSeconds }),
    signal,
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`deepgram answered ${res.status}`);
  }
  const data = (await res.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (
    typeof data.access_token !== 'string' ||
    data.access_token === '' ||
    !isPositive(data.expires_in)
  ) {
    throw new Error('deepgram answered an unexpected body');
  }
  return { token: data.access_token, expiresInSeconds: data.expires_in };
}
