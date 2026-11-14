import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { createRemoteJWKSet, jwtVerify } from 'jose';

if (getApps().length === 0) {
  initializeApp();
}

export const WORKOS_API_KEY = defineSecret('WORKOS_API_KEY');
/** The bare AuthKit host, e.g. `bright-sky-12.authkit.app`, no scheme. */
export const WORKOS_AUTHKIT_DOMAIN = defineSecret('WORKOS_AUTHKIT_DOMAIN');

const WORKOS_API = 'https://api.workos.com';
const REQUEST_TIMEOUT_MS = 8_000;
const IDENTITY_TTL_MS = 24 * 60 * 60 * 1000;

export class WorkosError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'WorkosError';
  }
}

export interface McpAccessClaims {
  workosUserId: string;
  clientId: string;
  /** Seconds since the epoch, as in the token. */
  issuedAt: number;
}

export const authkitOrigin = () =>
  `https://${WORKOS_AUTHKIT_DOMAIN.value().trim()}`;

let cachedJwks:
  { origin: string; keys: ReturnType<typeof createRemoteJWKSet> } | undefined;

const jwksFor = (origin: string) => {
  if (cachedJwks?.origin !== origin) {
    cachedJwks = {
      origin,
      keys: createRemoteJWKSet(new URL(`${origin}/oauth2/jwks`)),
    };
  }
  return cachedJwks.keys;
};

/** Checks an AuthKit access token's signature, issuer and audience and refuses agent tokens. Throws on any failure. */
export async function verifyMcpAccessToken(
  token: string,
  resource: string,
): Promise<McpAccessClaims> {
  const origin = authkitOrigin();
  const { payload } = await jwtVerify(token, jwksFor(origin), {
    issuer: origin,
    audience: resource,
    algorithms: ['RS256'],
    requiredClaims: ['exp', 'iat', 'sub'],
  });
  if (payload.sub_profile === 'ai_agent') {
    throw new Error('agent-token');
  }
  const clientId = payload.client_id;
  if (
    typeof payload.sub !== 'string' ||
    typeof clientId !== 'string' ||
    !clientId ||
    typeof payload.iat !== 'number'
  ) {
    throw new Error('missing-claims');
  }
  return { workosUserId: payload.sub, clientId, issuedAt: payload.iat };
}

async function workosFetch(
  path: string,
  init: { method: string; body?: unknown },
): Promise<unknown> {
  const hasBody = init.body !== undefined;
  const response = await fetch(`${WORKOS_API}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${WORKOS_API_KEY.value()}`,
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    body: hasBody ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const code =
      body && typeof body === 'object' && 'code' in body
        ? String((body as { code: unknown }).code).slice(0, 60)
        : 'http_error';
    throw new WorkosError(response.status, code);
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

const readField = (body: unknown, key: string): unknown =>
  body && typeof body === 'object' && key in body
    ? (body as Record<string, unknown>)[key]
    : null;

/** Finishes a Standalone Connect sign-in and returns the address AuthKit must send the person to next. */
export async function completeExternalAuth(
  externalAuthId: string,
  user: { uid: string; email: string; name: string | null },
): Promise<string> {
  const body = await workosFetch('/authkit/oauth2/complete', {
    method: 'POST',
    body: {
      external_auth_id: externalAuthId,
      user: {
        id: user.uid,
        email: user.email,
        ...(user.name ? { name: user.name } : {}),
      },
    },
  });
  const redirectUri = readField(body, 'redirect_uri');
  if (typeof redirectUri !== 'string' || !redirectUri.startsWith('https://')) {
    throw new WorkosError(502, 'no_redirect');
  }
  return redirectUri;
}

/** Our uid for a WorkOS user (their `external_id`, set when sign-in completed), cached for a day. `null` when WorkOS has none. */
export async function uidForWorkosUser(
  workosUserId: string,
): Promise<string | null> {
  const ref = getFirestore().doc(
    `mcpServer/identities/users/${encodeURIComponent(workosUserId)}`,
  );
  const cached = (await ref.get()).data();
  if (
    cached &&
    typeof cached.uid === 'string' &&
    typeof cached.cachedAt === 'number' &&
    Date.now() - cached.cachedAt < IDENTITY_TTL_MS
  ) {
    return cached.uid;
  }
  const body = await workosFetch(
    `/user_management/users/${encodeURIComponent(workosUserId)}`,
    { method: 'GET' },
  );
  const uid = readField(body, 'external_id');
  if (typeof uid !== 'string' || !uid) return null;
  await ref.set({ uid, cachedAt: Date.now() });
  return uid;
}

/** Removes the person's authorization of one client, so it can't refresh. A client already gone counts as done. */
export async function deleteClientAuthorization(
  workosUserId: string,
  clientId: string,
): Promise<void> {
  try {
    await workosFetch(
      `/user_management/users/${encodeURIComponent(workosUserId)}/authorized_applications/${encodeURIComponent(clientId)}`,
      { method: 'DELETE' },
    );
  } catch (error) {
    if (error instanceof WorkosError && error.status === 404) return;
    throw error;
  }
}
