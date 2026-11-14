import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { Request } from 'firebase-functions/v2/https';

import { clientNameFor, verifiedClientName } from './clientName.js';
import {
  clientKeyFor,
  clientStanding,
  jsonRpcError,
  protectedResourceMetadata,
  readBearerToken,
  readScopesOf,
  resourcePathOf,
  signInPathFor,
  wwwAuthenticate,
  type McpReadScope,
} from './shapes.js';
import {
  authkitOrigin,
  registeredClientName,
  uidForWorkosUser,
  verifyMcpAccessToken,
  type McpAccessClaims,
} from './workos.js';

const ACCOUNT_CHECK_MS = 5 * 60 * 1000;
const accountChecks = new Map<string, { isActive: boolean; at: number }>();

/** A deleted or disabled account loses its assistants within five minutes, whatever WorkOS still issues. */
const isAccountActive = async (uid: string) => {
  const cached = accountChecks.get(uid);
  if (cached && Date.now() - cached.at < ACCOUNT_CHECK_MS)
    return cached.isActive;
  const isActive = await getAuth()
    .getUser(uid)
    .then((user) => !user.disabled)
    .catch((error: { code?: string }) => {
      if (error.code === 'auth/user-not-found') return false;
      throw error;
    });
  accountChecks.set(uid, { isActive, at: Date.now() });
  return isActive;
};

export interface McpRequestContext {
  uid: string;
  clientKey: string;
  clientId: string;
  clientName: string;
  canWrite: boolean;
  readScopes: McpReadScope[];
}

interface McpHttpOptions {
  appId: string;
  resource: string;
  buildServer: (ctx: McpRequestContext) => Promise<McpServer>;
}

const PROTECTED_METADATA_PREFIX = '/.well-known/oauth-protected-resource';
const SERVER_METADATA_PATH = '/.well-known/oauth-authorization-server';
const SERVER_METADATA_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6_000;

let serverMetadata: { origin: string; at: number; body: unknown } | undefined;

const setCors = (res: Response) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id',
    'Access-Control-Expose-Headers': 'WWW-Authenticate',
  });
};

async function readAuthorizationServerMetadata(origin: string) {
  if (
    serverMetadata?.origin === origin &&
    Date.now() - serverMetadata.at < SERVER_METADATA_TTL_MS
  ) {
    return serverMetadata.body;
  }
  const response = await fetch(`${origin}${SERVER_METADATA_PATH}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('metadata-unavailable');
  const body: unknown = await response.json();
  serverMetadata = { origin, at: Date.now(), body };
  return body;
}

const isProtectedMetadataPath = (path: string, resource: string) =>
  path === PROTECTED_METADATA_PREFIX ||
  path === `${PROTECTED_METADATA_PREFIX}${resourcePathOf(resource)}`;

async function sealClient(
  appId: string,
  uid: string,
  claims: McpAccessClaims,
): Promise<McpRequestContext | 'revoked'> {
  const firestore = getFirestore();
  const clientKey = clientKeyFor(claims.clientId);
  const ref = firestore.doc(`mcpClients/${uid}/clients/${clientKey}`);
  const isUnverified =
    verifiedClientName(claims.clientId) === null && !(await ref.get()).exists;
  const clientName = clientNameFor(
    claims.clientId,
    isUnverified
      ? await registeredClientName(claims.workosUserId, claims.clientId)
      : null,
  );
  const now = Date.now();
  return firestore.runTransaction(async (transaction) => {
    const stored = (await transaction.get(ref)).data();
    if (!stored) {
      transaction.create(ref, {
        appId,
        clientId: claims.clientId,
        name: clientName,
        workosUserId: claims.workosUserId,
        firstSeenAt: now,
        lastUsedAt: now,
        canWrite: true,
        readScopes: [],
        revokedAt: null,
      });
      return {
        uid,
        clientKey,
        clientId: claims.clientId,
        clientName,
        canWrite: true,
        readScopes: [],
      };
    }
    const revokedAt =
      typeof stored.revokedAt === 'number' ? stored.revokedAt : null;
    const signIn =
      revokedAt === null
        ? undefined
        : (await transaction.get(firestore.doc(signInPathFor(uid)))).data();
    const standing = clientStanding(
      {
        lastUsedAt:
          typeof stored.lastUsedAt === 'number' ? stored.lastUsedAt : 0,
        revokedAt,
      },
      claims.issuedAt,
      now,
      typeof signIn?.at === 'number' ? signIn.at : null,
    );
    if (standing.kind === 'revoked') return 'revoked';
    if (standing.clearRevoked || standing.touchLastUsed) {
      transaction.update(ref, {
        lastUsedAt: now,
        ...(standing.clearRevoked ? { revokedAt: null } : {}),
      });
    }
    return {
      uid,
      clientKey,
      clientId: claims.clientId,
      clientName: typeof stored.name === 'string' ? stored.name : clientName,
      canWrite: stored.canWrite === true,
      readScopes: readScopesOf(stored.readScopes),
    };
  });
}

const refuse = (
  res: Response,
  status: number,
  code: number,
  message: string,
  extra?: Record<string, string>,
) => {
  if (extra) res.set(extra);
  res.status(status).json(jsonRpcError(code, message));
};

async function serveTool(
  options: McpHttpOptions,
  req: Request,
  res: Response,
): Promise<void> {
  const token = readBearerToken(req.header('authorization'));
  const challenge = { 'WWW-Authenticate': wwwAuthenticate(options.resource) };
  if (!token) {
    refuse(res, 401, -32001, 'Sign in to continue.', challenge);
    return;
  }
  const claims = await verifyMcpAccessToken(token, options.resource).catch(
    () => null,
  );
  if (!claims) {
    refuse(res, 401, -32001, 'Sign in again to continue.', challenge);
    return;
  }
  const uid = await uidForWorkosUser(claims.workosUserId);
  if (!uid) {
    refuse(res, 403, -32002, 'This sign-in is not linked to an account.');
    return;
  }
  if (!(await isAccountActive(uid))) {
    refuse(res, 403, -32002, 'This account is closed or turned off.');
    return;
  }
  const context = await sealClient(options.appId, uid, claims);
  if (context === 'revoked') {
    refuse(
      res,
      403,
      -32002,
      "This assistant was disconnected in the app's settings. Connect it again to continue.",
    );
    return;
  }
  const server = await options.buildServer(context);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

/** An `onRequest` handler that sign-in checks and serves one app's MCP tools over stateless Streamable HTTP. */
export function createMcpHttpHandler(options: McpHttpOptions) {
  const resourcePath = resourcePathOf(options.resource);
  return async (req: Request, res: Response): Promise<void> => {
    setCors(res);
    try {
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      if (
        req.method === 'GET' &&
        isProtectedMetadataPath(req.path, options.resource)
      ) {
        res.set('Cache-Control', 'public, max-age=300');
        res.json(protectedResourceMetadata(options.resource, authkitOrigin()));
        return;
      }
      if (req.method === 'GET' && req.path === SERVER_METADATA_PATH) {
        const body = await readAuthorizationServerMetadata(authkitOrigin());
        res.set('Cache-Control', 'public, max-age=300');
        res.json(body);
        return;
      }
      if (req.path.replace(/\/$/, '') !== resourcePath) {
        res.status(404).json({ error: 'Not found.' });
        return;
      }
      if (req.method !== 'POST') {
        refuse(res, 405, -32000, 'Method not allowed.', { Allow: 'POST' });
        return;
      }
      await serveTool(options, req, res);
    } catch (error) {
      logger.error('mcp.request.failed', {
        appId: options.appId,
        cause: error instanceof Error ? error.name : 'error',
      });
      if (!res.headersSent) {
        refuse(
          res,
          500,
          -32603,
          'Something went wrong. Try again in a moment.',
        );
      }
    }
  };
}
