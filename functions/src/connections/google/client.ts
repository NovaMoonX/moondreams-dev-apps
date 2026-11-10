import { answerFixture, type FixtureContext } from './fixtures.js';

/** Google answered with a failure; only the status is kept, never the body or the address. */
export class GoogleHttpError extends Error {
  readonly code: string;
  constructor(readonly status: number) {
    super('Google could not answer the request.');
    this.name = 'GoogleHttpError';
    this.code = `http-${status}`;
  }
}

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
  if (status < 200 || status > 299) throw new GoogleHttpError(status);
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
