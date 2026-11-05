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
import {
  hasProviderSecrets,
  plaidProvider,
  PROVIDER_SECRETS,
} from './providerPlaid.js';
import { standInProvider } from './providerStandIn.js';

const pickProvider = () =>
  process.env.FUNCTIONS_EMULATOR === 'true' && !hasProviderSecrets()
    ? standInProvider
    : plaidProvider;

/** The bank data provider; the Functions emulator without keys gets a stand-in bank so linking can be walked locally. */
export const provider: BankDataProvider = {
  createLinkSession: (uid) => pickProvider().createLinkSession(uid),
  exchange: (publicToken) => pickProvider().exchange(publicToken),
  getInstitutionName: (grant) => pickProvider().getInstitutionName(grant),
  listAccounts: (grant) => pickProvider().listAccounts(grant),
  revoke: (grant) => pickProvider().revoke(grant),
  syncTransactions: (grant, cursor) =>
    pickProvider().syncTransactions(grant, cursor),
};
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
  /** What the bank said at sign-in, so a link finished later still starts a new account or card from it. */
  balanceCents: number | null;
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
