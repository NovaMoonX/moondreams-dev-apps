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

/** A recording written out: the words and the length the provider measured. Never logs or reports the key or the audio. */
export async function transcribeDeepgram({
  apiKey,
  bytes,
  mimeType,
  model,
  signal,
  fetchImpl = fetch,
}: {
  apiKey: string;
  bytes: Uint8Array;
  mimeType: string;
  model: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ text: string; durationMs: number }> {
  const res = await fetchImpl(
    `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(model)}&smart_format=true&mip_opt_out=true`,
    {
      method: 'POST',
      headers: { Authorization: `Token ${apiKey}`, 'Content-Type': mimeType },
      body: new Uint8Array(bytes),
      signal,
    },
  );
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`deepgram answered ${res.status}`);
  }
  const data = (await res.json()) as {
    metadata?: { duration?: unknown };
    results?: {
      channels?: { alternatives?: { transcript?: unknown }[] }[];
    };
  };
  const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  const seconds = data.metadata?.duration;
  if (typeof transcript !== 'string' || !isPositive(seconds)) {
    throw new Error('deepgram answered an unexpected body');
  }
  return { text: transcript.trim(), durationMs: Math.round(seconds * 1000) };
}
