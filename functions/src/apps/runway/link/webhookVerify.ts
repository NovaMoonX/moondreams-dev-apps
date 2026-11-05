import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify,
} from 'node:crypto';

import type { WebhookKey } from './providerPlaid.js';

const MAX_AGE_MS = 5 * 60 * 1000;

const decodePart = (part: string) =>
  JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;

/**
 * Checks Plaid's `Plaid-Verification` header against the body it arrived with: ES256, the key Plaid names by `kid`,
 * issued within five minutes, and the body's SHA-256 equal to the claim. Answers false for anything wrong, never throws.
 */
export async function verifyPlaidWebhook(
  header: string | undefined,
  rawBody: Buffer,
  now: number,
  getKey: (keyId: string) => Promise<WebhookKey | null>,
): Promise<boolean> {
  try {
    const parts = (header ?? '').split('.');
    if (parts.length !== 3) return false;
    const head = decodePart(parts[0]);
    const claims = decodePart(parts[1]);
    if (head.alg !== 'ES256' || typeof head.kid !== 'string') return false;
    if (typeof claims.iat !== 'number') return false;
    if (Math.abs(now - claims.iat * 1000) > MAX_AGE_MS) return false;

    const key = await getKey(head.kid);
    if (!key || key.kty !== 'EC' || key.crv !== 'P-256') return false;
    if (key.expired_at != null) return false;

    const isSigned = verify(
      'sha256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      {
        key: createPublicKey({
          key: { kty: key.kty, crv: key.crv, x: key.x, y: key.y },
          format: 'jwk',
        }),
        dsaEncoding: 'ieee-p1363',
      },
      Buffer.from(parts[2], 'base64url'),
    );
    if (!isSigned || typeof claims.request_body_sha256 !== 'string') {
      return false;
    }
    const claimed = Buffer.from(claims.request_body_sha256, 'hex');
    const actual = createHash('sha256').update(rawBody).digest();
    return claimed.length === actual.length && timingSafeEqual(claimed, actual);
  } catch {
    return false;
  }
}
