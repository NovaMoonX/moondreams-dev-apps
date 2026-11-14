import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  HttpsError,
  onCall,
  type CallableOptions,
  type CallableRequest,
} from 'firebase-functions/v2/https';

import { signInPathFor } from './shapes.js';
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
      await getFirestore().doc(signInPathFor(uid)).set({ at: Date.now() });
      const redirectUri = await completeExternalAuth(externalAuthId, {
        uid,
        email,
        name: typeof token?.name === 'string' && token.name ? token.name : null,
      });
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

export const updateMcpClient = onCall(
  OPTIONS,
  async (request): Promise<{ ok: true }> => {
    const uid = requireUid(request);
    const clientKey = readClientKey(request.data);
    const { canWrite } = readObject(request.data);
    if (typeof canWrite !== 'boolean') {
      throw new HttpsError(
        'invalid-argument',
        'Choose read only or read and write.',
      );
    }
    const ref = clientRef(uid, clientKey);
    await getFirestore().runTransaction(async (transaction) => {
      if (!(await transaction.get(ref)).exists) {
        throw new HttpsError(
          'not-found',
          'That assistant is no longer connected.',
        );
      }
      transaction.update(ref, { canWrite });
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
