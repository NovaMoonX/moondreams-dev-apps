import { ReconnectNeeded } from '../tokens.js';
import {
  answerFixture,
  answerFixtureSend,
  type FixtureContext,
} from './fixtures.js';

/** Google answered with a failure; only the status is kept, never the body or the address. */
export class GoogleHttpError extends Error {
  readonly code: string;
  constructor(
    readonly status: number,
    readonly reason: string | null = null,
  ) {
    super('Google could not answer the request.');
    this.name = 'GoogleHttpError';
    this.code = `http-${status}`;
  }
}

const RATE_LIMIT_REASONS = [
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'quotaExceeded',
  'dailyLimitExceeded',
];

export const readGoogleReason = (body: unknown): string | null => {
  const error = (body as { error?: unknown } | null)?.error as
    { errors?: { reason?: unknown }[]; status?: unknown } | undefined;
  const reason = error?.errors?.[0]?.reason ?? error?.status;
  return typeof reason === 'string' ? reason.slice(0, 60) : null;
};

/** A refusal for asking too often or too much: it passes by itself, so it is never a reason to reconnect. */
export const isRateLimited = (error: unknown) =>
  error instanceof GoogleHttpError &&
  (error.status === 429 ||
    (error.status === 403 &&
      error.reason !== null &&
      RATE_LIMIT_REASONS.includes(error.reason)));

/** Google refusing the sign-in means the account needs Reconnect; a rate limit or any other failure passes through. */
export const toReconnectOnRefusal = (error: unknown): never => {
  throw error instanceof GoogleHttpError &&
    !isRateLimited(error) &&
    (error.status === 401 || error.status === 403)
    ? new ReconnectNeeded()
    : error;
};

/** The saved sync token is no longer valid, so the calendar needs a full read. */
export class SyncTokenGone extends Error {
  readonly code = 'syncTokenGone';
  constructor() {
    super('The saved sync token is no longer valid.');
    this.name = 'SyncTokenGone';
  }
}

const isFixtureToken = (token: string) =>
  token === 'fixture' && process.env.FUNCTIONS_EMULATOR === 'true';

const toBody = async <T>(status: number, body: () => Promise<unknown>) => {
  if (status === 410) throw new SyncTokenGone();
  if (status < 200 || status > 299)
    throw new GoogleHttpError(
      status,
      readGoogleReason(await body().catch(() => null)),
    );
  return (await body()) as T;
};

export async function googleGet<T>(
  token: string,
  url: string,
  fixture: FixtureContext = { email: null },
): Promise<T> {
  if (isFixtureToken(token)) {
    const answer = answerFixture(url, fixture);
    return toBody<T>(answer.status, async () => answer.body);
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return toBody<T>(response.status, () => response.json());
}

/** Writes to Google with POST, PATCH or DELETE; a refusal or any failure surfaces as `GoogleHttpError`, the same as a read, and a body-less answer reads as `null`. */
export async function googleSend<T = unknown>(
  token: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body: unknown = null,
): Promise<T | null> {
  if (isFixtureToken(token)) {
    const answer = answerFixtureSend(method, url, body);
    if (answer.status < 200 || answer.status > 299)
      throw new GoogleHttpError(answer.status);
    return answer.body as T | null;
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === null ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === null ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok)
    throw new GoogleHttpError(
      response.status,
      readGoogleReason(await response.json().catch(() => null)),
    );
  return (await response.json().catch(() => null)) as T | null;
}

/** Fetches a file's bytes: an export or a download, not JSON. */
export async function googleGetBytes(
  token: string,
  url: string,
  fixture: FixtureContext = { email: null },
): Promise<Uint8Array> {
  if (isFixtureToken(token)) {
    const answer = answerFixture(url, fixture);
    if (answer.status < 200 || answer.status > 299) {
      throw new GoogleHttpError(answer.status);
    }
    return Buffer.from(answer.body as string | Uint8Array);
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new GoogleHttpError(response.status);
  return new Uint8Array(await response.arrayBuffer());
}

const MAX_PUBLIC_BYTES = 5 * 1024 * 1024;
const PUBLIC_TIMEOUT_MS = 8000;

/** Fetches a public file without the account's token, never following a redirect, and refuses one over 5 MB. */
export async function googleGetPublicBytes(
  token: string,
  url: string,
  fixture: FixtureContext = { email: null },
): Promise<Uint8Array> {
  if (isFixtureToken(token)) {
    const answer = answerFixture(url, fixture);
    if (answer.status < 200 || answer.status > 299) {
      throw new GoogleHttpError(answer.status);
    }
    return Buffer.from(answer.body as Uint8Array);
  }
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(PUBLIC_TIMEOUT_MS),
  });
  if (!response.ok) throw new GoogleHttpError(response.status);
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_PUBLIC_BYTES) throw new GoogleHttpError(413);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_PUBLIC_BYTES) throw new GoogleHttpError(413);
  return bytes;
}
