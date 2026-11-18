import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  HttpsError,
  onCall,
  type CallableOptions,
  type CallableRequest,
} from 'firebase-functions/v2/https';

import { MCP_READ_SCOPES, signInPathFor } from './shapes.js';
import {
  WORKOS_API_KEY,
  completeExternalAuth,
  deleteClientAuthorization,
  WorkosError,
} from './workos.js';

if (getApps().length === 0) {
  initializeApp();
}

const OPTIONS: CallableOptions = {
  region: 'us-central1',
  maxInstances: 5,
  timeoutSeconds: 30,
  enforceAppCheck: true,
  cors: [
    'https://apps.moondreams.dev',
    /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
  ],
};

const EXTERNAL_AUTH_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;
const CLIENT_KEY_RE = /^[0-9a-f]{32}$/;

const requireUid = (request: CallableRequest) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  return uid;
};

const readObject = (data: unknown): Record<string, unknown> =>
  data && typeof data === 'object' ? (data as Record<string, unknown>) : {};

const readClientKey = (data: unknown) => {
  const { clientKey } = readObject(data);
  if (typeof clientKey !== 'string' || !CLIENT_KEY_RE.test(clientKey)) {
    throw new HttpsError(
      'invalid-argument',
      'This assistant could not be read.',
    );
  }
  return clientKey;
};

const clientRef = (uid: string, clientKey: string) =>
  getFirestore().doc(`mcpClients/${uid}/clients/${clientKey}`);

const failureCode = (error: unknown) =>
  error instanceof WorkosError ? error.code : 'error';

export const completeMcpSignIn = onCall(
  { ...OPTIONS, secrets: [WORKOS_API_KEY] },
  async (request): Promise<{ redirectUri: string }> => {
    const uid = requireUid(request);
    const { externalAuthId } = readObject(request.data);
    if (
      typeof externalAuthId !== 'string' ||
      !EXTERNAL_AUTH_ID_RE.test(externalAuthId)
    ) {
      throw new HttpsError(
        'invalid-argument',
        'This sign-in link is not valid. Start again from your assistant.',
      );
    }
    const token = request.auth?.token;
    const email = typeof token?.email === 'string' ? token.email : null;
    if (!email || token?.email_verified !== true) {
      throw new HttpsError(
        'failed-precondition',
        'Verify your email address before connecting an assistant.',
      );
    }
    try {
      const redirectUri = await completeExternalAuth(externalAuthId, {
        uid,
        email,
        name: typeof token?.name === 'string' && token.name ? token.name : null,
      });
      await getFirestore().doc(signInPathFor(uid)).set({ at: Date.now() });
      return { redirectUri };
    } catch (error) {
      logger.warn('mcp.signIn.failed', { code: failureCode(error) });
      const isStale =
        error instanceof WorkosError &&
        error.status >= 400 &&
        error.status < 500;
      throw new HttpsError(
        isStale ? 'invalid-argument' : 'internal',
        'Could not finish connecting. Start again from your assistant.',
      );
    }
  },
);

/** What a person changed on a connected assistant: whether it may write, or one read permission on or off. */
const readClientChange = (data: unknown) => {
  const { canWrite, readScope, isOn } = readObject(data);
  const scope = MCP_READ_SCOPES.find((entry) => entry === readScope);
  if (typeof canWrite === 'boolean') return { canWrite };
  if (scope && typeof isOn === 'boolean') {
    return {
      readScopes: isOn
        ? FieldValue.arrayUnion(scope)
        : FieldValue.arrayRemove(scope),
    };
  }
  throw new HttpsError(
    'invalid-argument',
    'Choose what this assistant can do.',
  );
};

export const updateMcpClient = onCall(
  OPTIONS,
  async (request): Promise<{ ok: true }> => {
    const uid = requireUid(request);
    const clientKey = readClientKey(request.data);
    const change = readClientChange(request.data);
    const ref = clientRef(uid, clientKey);
    await getFirestore().runTransaction(async (transaction) => {
      if (!(await transaction.get(ref)).exists) {
        throw new HttpsError(
          'not-found',
          'That assistant is no longer connected.',
        );
      }
      transaction.update(ref, change);
    });
    return { ok: true };
  },
);

export const disconnectMcpClient = onCall(
  { ...OPTIONS, secrets: [WORKOS_API_KEY] },
  async (request): Promise<{ ok: true }> => {
    const uid = requireUid(request);
    const clientKey = readClientKey(request.data);
    const ref = clientRef(uid, clientKey);
    const stored = (await ref.get()).data();
    if (!stored) {
      throw new HttpsError(
        'not-found',
        'That assistant is no longer connected.',
      );
    }
    await ref.update({ revokedAt: Date.now() });
    if (
      typeof stored.workosUserId === 'string' &&
      typeof stored.clientId === 'string'
    ) {
      await deleteClientAuthorization(
        stored.workosUserId,
        stored.clientId,
      ).catch((error: unknown) =>
        logger.warn('mcp.disconnect.authorizationNotDeleted', {
          code: failureCode(error),
        }),
      );
    }
    return { ok: true };
  },
);

/** Disconnects every assistant the person connected, for any app: the record at once, then each provider grant (best effort). */
export async function disconnectAllMcpClients(uid: string): Promise<void> {
  const now = Date.now();
  const live = await getFirestore()
    .collection(`mcpClients/${uid}/clients`)
    .where('revokedAt', '==', null)
    .get();
  await Promise.all(
    live.docs.map(async (snapshot) => {
      await snapshot.ref.update({ revokedAt: now });
      const { workosUserId, clientId } = snapshot.data();
      if (typeof workosUserId !== 'string' || typeof clientId !== 'string') {
        return;
      }
      await deleteClientAuthorization(workosUserId, clientId).catch(
        (error: unknown) =>
          logger.warn('mcp.disconnect.authorizationNotDeleted', {
            code: failureCode(error),
          }),
      );
    }),
  );
}
