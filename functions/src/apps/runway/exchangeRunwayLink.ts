import { randomUUID } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import { grantsPath, sealGrant } from './link/grant.js';
import {
  LINK_CORS,
  LINK_SECRETS,
  loadKeyringOrFail,
  planDocPath,
  provider,
  requireLinkCaller,
  SEALED_SCHEMA_VERSION,
  withProvider,
  type LinkSealed,
} from './link/linkShared.js';
import type { ProviderGrant } from './link/provider.js';
import { discardSupersededLinks } from './link/unfinishedLinks.js';
import { sealWithKey, unwrapPlanKey } from './planKey.js';

if (getApps().length === 0) {
  initializeApp();
}

const MAX_NAME = 80;
const FALLBACK_NAME = 'Your bank';

const cleanName = (value: unknown) =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim().slice(0, MAX_NAME)
    : null;

/** Stops a grant the person never got to use from lingering at the provider. */
const revokeQuietly = (grant: ProviderGrant) =>
  provider.revoke(grant).catch(() => {
    logger.warn('runway.link.revokeFailed');
  });

/**
 * `{ publicToken, institutionName }` → `{ linkId, institutionName, accounts }`: swaps the bank window's token for a
 * grant sealed on the server, stores the link and returns the accounts with live balances. The grant is never returned.
 * The person's older unfinished links at the same bank are revoked and removed, so one unfinished link per bank remains.
 */
export const exchangeRunwayLink = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 60,
    secrets: [...LINK_SECRETS, RUNWAY_MASTER_KEYS],
    cors: LINK_CORS,
  },
  async (request) => {
    const uid = await requireLinkCaller(request);
    const publicToken: unknown = request.data?.publicToken;
    if (typeof publicToken !== 'string' || publicToken === '') {
      throw new HttpsError('invalid-argument', 'The bank sign-in is missing.');
    }

    const keyring = loadKeyringOrFail();
    const firestore = getFirestore();
    const planKey = await unwrapPlanKey(firestore, keyring, uid).catch(() => {
      throw new HttpsError(
        'failed-precondition',
        'Open your plan once before linking a bank.',
      );
    });

    const grant = await withProvider(() => provider.exchange(publicToken));
    try {
      const accounts = await withProvider(() => provider.listAccounts(grant));
      const institutionName =
        cleanName(request.data?.institutionName) ??
        cleanName(
          await withProvider(() => provider.getInstitutionName(grant)).catch(
            () => null,
          ),
        ) ??
        FALLBACK_NAME;

      const linkId = randomUUID();
      const now = Date.now();
      const linkSealed: LinkSealed = {
        institutionName,
        providerAccounts: accounts.map((account) => ({
          providerAccountId: account.providerAccountId,
          name: account.name,
          kind: account.kind,
          mask: account.mask,
          accountId: null,
          cardId: null,
          isSkipped: false,
        })),
      };
      const batch = firestore.batch();
      batch.create(
        firestore.doc(`${grantsPath(uid)}/${linkId}`),
        sealGrant(keyring, uid, linkId, grant, now),
      );
      batch.create(firestore.doc(planDocPath(uid, 'links', linkId)), {
        id: linkId,
        status: 'active',
        lastSyncAt: null,
        createdAt: now,
        sealed: sealWithKey(planKey, { ...linkSealed }, SEALED_SCHEMA_VERSION),
      });
      await batch.commit();

      await discardSupersededLinks(firestore, keyring, planKey.key, uid, {
        linkId,
        institutionName,
      }).catch(() => {
        logger.warn('runway.link.supersedeFailed');
      });

      logger.info('runway.link.exchanged', {
        linkId,
        accounts: accounts.length,
      });
      const result = { linkId, institutionName, accounts };
      return result;
    } catch (error) {
      await revokeQuietly(grant);
      throw error;
    }
  },
);
