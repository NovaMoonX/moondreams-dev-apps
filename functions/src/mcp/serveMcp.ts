import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { Request } from 'firebase-functions/v2/https';

import { clientNameFor } from './clientName.js';
import {
  clientKeyFor,
  clientStanding,
  jsonRpcError,
  protectedResourceMetadata,
  readBearerToken,
  resourcePathOf,
  signInPathFor,
  wwwAuthenticate,
} from './shapes.js';
import {
  authkitOrigin,
  uidForWorkosUser,
  verifyMcpAccessToken,
  type McpAccessClaims,
} from './workos.js';

export interface McpRequestContext {
  uid: string;
  clientKey: string;
  clientId: string;
  clientName: string;
  canWrite: boolean;
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
  const clientName = clientNameFor(claims.clientId);
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
        revokedAt: null,
      });
      return {
        uid,
        clientKey,
        clientId: claims.clientId,
        clientName,
        canWrite: true,
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
      clientName,
      canWrite: stored.canWrite === true,
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
      if (req.path !== resourcePath) {
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
