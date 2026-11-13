import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  HttpsError,
  onCall,
  type CallableOptions,
} from 'firebase-functions/v2/https';

import type {
  ConnectorOption,
  ReadConnectorOptionsRequest,
} from '../vendor/connectionsContract.js';
import { SOURCE_ADAPTERS, SOURCE_SECRETS } from './registry.js';
import { errorCause } from './syncRunner.js';
import { ReconnectNeeded } from './tokens.js';

if (getApps().length === 0) {
  initializeApp();
}

const OPTIONS: CallableOptions = {
  region: 'us-central1',
  maxInstances: 5,
  timeoutSeconds: 30,
  enforceAppCheck: true,
  secrets: SOURCE_SECRETS,
  cors: [
    'https://apps.moondreams.dev',
    /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
  ],
};

const readRequest = (data: unknown): ReadConnectorOptionsRequest => {
  const { connectorId, accountId } = (data ?? {}) as Record<string, unknown>;
  if (
    typeof connectorId !== 'string' ||
    typeof accountId !== 'string' ||
    accountId === '' ||
    accountId.includes('/')
  )
    throw new HttpsError(
      'invalid-argument',
      'Name a connector and an account.',
    );
  return {
    connectorId: connectorId as ReadConnectorOptionsRequest['connectorId'],
    accountId,
  };
};

export const readConnectorOptions = onCall(
  OPTIONS,
  async (request): Promise<{ options: ConnectorOption[] }> => {
    const uid = request.auth?.uid;
    if (!uid)
      throw new HttpsError('unauthenticated', 'Sign in to connect accounts.');
    const { connectorId, accountId } = readRequest(request.data);
    const adapter = Object.hasOwn(SOURCE_ADAPTERS, connectorId)
      ? SOURCE_ADAPTERS[connectorId]
      : undefined;
    if (!adapter?.readOptions)
      throw new HttpsError(
        'invalid-argument',
        'This connector has no choices.',
      );
    const firestore = getFirestore();
    const account = await firestore
      .doc(`connections/${uid}/accounts/${accountId}`)
      .get();
    if (!account.exists || account.get('status') !== 'live')
      throw new HttpsError(
        'failed-precondition',
        'Reconnect this account to continue.',
        { reason: 'reconnect' },
      );
    try {
      return {
        options: await adapter.readOptions({ firestore, uid, accountId }),
      };
    } catch (error) {
      if (error instanceof ReconnectNeeded)
        throw new HttpsError(
          'failed-precondition',
          'Reconnect this account to continue.',
          { reason: 'reconnect' },
        );
      logger.warn('connections.options.failed', {
        connectorId,
        cause: errorCause(error),
      });
      throw new HttpsError(
        'unavailable',
        "Couldn't read the calendars just now. Try again in a moment.",
      );
    }
  },
);
