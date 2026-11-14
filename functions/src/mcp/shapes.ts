import { createHash } from 'node:crypto';

export const LAST_USED_WRITE_MS = 10 * 60 * 1000;

/** The kinds of source an assistant can be allowed to read, each its own permission on the connection. */
export const MCP_READ_SCOPES = ['mail', 'drive', 'apps'] as const;
export type McpReadScope = (typeof MCP_READ_SCOPES)[number];

/** The known permissions in a stored list, once each; anything else is dropped. */
export const readScopesOf = (stored: unknown): McpReadScope[] =>
  MCP_READ_SCOPES.filter(
    (scope) => Array.isArray(stored) && stored.includes(scope),
  );

/** The document key for an OAuth client: the first 32 hex characters of its id's SHA-256. */
export const clientKeyFor = (clientId: string) =>
  createHash('sha256').update(clientId).digest('hex').slice(0, 32);

export const resourcePathOf = (resource: string) => new URL(resource).pathname;

export const protectedResourceMetadataUrl = (resource: string) =>
  `${new URL(resource).origin}/.well-known/oauth-protected-resource${resourcePathOf(resource)}`;

export const wwwAuthenticate = (resource: string) =>
  [
    'Bearer error="unauthorized"',
    'error_description="Authorization needed"',
    `resource_metadata="${protectedResourceMetadataUrl(resource)}"`,
  ].join(', ');

export const protectedResourceMetadata = (
  resource: string,
  authorizationServerOrigin: string,
) => ({
  resource,
  authorization_servers: [authorizationServerOrigin],
  bearer_methods_supported: ['header'],
});

export const jsonRpcError = (code: number, message: string) => ({
  jsonrpc: '2.0' as const,
  error: { code, message },
  id: null,
});

export interface StoredClient {
  lastUsedAt: number;
  revokedAt: number | null;
}

export type ClientStanding =
  | { kind: 'revoked' }
  | { kind: 'ok'; clearRevoked: boolean; touchLastUsed: boolean };

// A disconnect clears only on a reconnect: a token issued after it and a sign-in through our page after it.
// A refresh alone can't undo a disconnect whose provider-side revocation failed.
export const clientStanding = (
  stored: StoredClient,
  issuedAtSeconds: number,
  now: number,
  lastSignInAt: number | null = null,
): ClientStanding => {
  if (
    stored.revokedAt !== null &&
    (issuedAtSeconds * 1000 <= stored.revokedAt ||
      lastSignInAt === null ||
      lastSignInAt <= stored.revokedAt)
  ) {
    return { kind: 'revoked' };
  }
  return {
    kind: 'ok',
    clearRevoked: stored.revokedAt !== null,
    touchLastUsed: now - stored.lastUsedAt >= LAST_USED_WRITE_MS,
  };
};

/** Where the last sign-in through the site's own page is kept, per person. Admin SDK only. */
export const signInPathFor = (uid: string) => `mcpServer/signIns/users/${uid}`;

export const readBearerToken = (header: string | undefined) =>
  header?.match(/^Bearer (\S+)$/i)?.[1] ?? null;
