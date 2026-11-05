import { logger } from 'firebase-functions';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import { assertGateOpen } from '../../../gates/assertGateOpen.js';
import { loadKeyring } from '../getRunwayKey.js';
import type { Keyring } from '../planKey.js';
import {
  ProviderError,
  type BankDataProvider,
  type NormalizedAccount,
} from './provider.js';
import { plaidProvider, PROVIDER_SECRETS } from './providerPlaid.js';

export const provider: BankDataProvider = plaidProvider;
export const LINK_SECRETS = PROVIDER_SECRETS;

export const LINK_CORS = [
  'https://apps.moondreams.dev',
  /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
];

export const SEALED_SCHEMA_VERSION = 1;

export const planDocPath = (uid: string, collection: string, id: string) =>
  `apps/runway/plans/${uid}/${collection}/${id}`;

export interface ProviderAccountSealed {
  providerAccountId: string;
  name: string;
  kind: NormalizedAccount['kind'];
  mask: string | null;
  accountId: string | null;
  cardId: string | null;
  isSkipped: boolean;
}

export interface LinkSealed {
  institutionName: string;
  providerAccounts: ProviderAccountSealed[];
}

/** Checks the sign-in and the `link-banks` switch for the caller and returns their uid. */
export async function requireLinkCaller(request: CallableRequest) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to link a bank.');
  }
  await assertGateOpen(
    request,
    'runway',
    'link-banks',
    'off',
    'Linking a bank is not open for you yet.',
  );
  return uid;
}

/** Runs a provider call and turns its failure into an error the person can read. */
export async function withProvider<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ProviderError) {
      logger.warn('runway.link.providerFailed', { kind: error.kind });
      throw new HttpsError(
        error.kind === 'unavailable' ? 'unavailable' : 'failed-precondition',
        error.message,
      );
    }
    throw error;
  }
}

export function loadKeyringOrFail(): Keyring {
  try {
    return loadKeyring();
  } catch {
    logger.error('runway.link.keyringInvalid');
    throw new HttpsError(
      'failed-precondition',
      'Your plan cannot be opened right now.',
    );
  }
}
