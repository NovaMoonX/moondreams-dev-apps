import { randomUUID } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import { learnInstitutionLogo } from './institutionLogos.js';
import {
  grantsPath,
  itemIndexPath,
  sealGrant,
  type ItemIndexDoc,
} from './link/grant.js';
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
import { isTwinLink } from './link/twinLinks.js';
import {
  discardSupersededLinks,
  isUnfinishedLink,
} from './link/unfinishedLinks.js';
import {
  openWithKey,
  sealWithKey,
  unwrapPlanKey,
  type SealedPayload,
} from './planKey.js';

if (getApps().length === 0) {
  initializeApp();
}

const MAX_NAME = 80;
const FALLBACK_NAME = 'Your bank';

const cleanName = (value: unknown) =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim().slice(0, MAX_NAME)
    : null;

/** A finished, live link that already holds one of these accounts, so this sign-in repeats it; null when none does. */
async function findTwinLinkId(
  firestore: Firestore,
  planKey: Buffer,
  uid: string,
  institutionName: string,
  accounts: readonly { name: string; mask: string | null }[],
) {
  const snapshots = await firestore
    .collection(`apps/runway/plans/${uid}/links`)
    .get();
  const twin = snapshots.docs.find((snapshot) => {
    const data = snapshot.data();
    if (data.status === 'revoked') return false;
    try {
      const link = openWithKey(
        planKey,
        data.sealed as SealedPayload,
      ) as unknown as LinkSealed;
      return (
        !isUnfinishedLink(link) && isTwinLink(link, institutionName, accounts)
      );
    } catch {
      return false;
    }
  });
  return twin?.id ?? null;
}

/** Stops a grant the person never got to use from lingering at the provider. */
const revokeQuietly = (grant: ProviderGrant) =>
  provider.revoke(grant).catch(() => {
    logger.warn('runway.link.revokeFailed');
  });

/** `{ publicToken, institutionName }` → `{ linkId, institutionName, accounts }`: seals the grant server-side and replaces older unfinished links at the bank. */
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
      const institution = await withProvider(() =>
        provider.getInstitution(grant),
      ).catch(() => null);
      const institutionName =
        cleanName(request.data?.institutionName) ??
        cleanName(institution?.name) ??
        FALLBACK_NAME;

      const twinLinkId = await findTwinLinkId(
        firestore,
        planKey.key,
        uid,
        institutionName,
        accounts,
      );
      if (twinLinkId !== null) {
        logger.info('runway.link.twinRefused', { twinLinkId });
        throw new HttpsError(
          'already-exists',
          `${institutionName} is already linked. Add more accounts from it in Settings instead.`,
          { twinLinkId },
        );
      }

      const linkId = randomUUID();
      const now = Date.now();
      const linkSealed: LinkSealed = {
        institutionName,
        institutionLogo: institution?.logo ?? null,
        institutionDomain: institution?.domain ?? null,
        institutionCheckedAt: now,
        providerAccounts: accounts.map((account) => ({
          providerAccountId: account.providerAccountId,
          name: account.name,
          kind: account.kind,
          mask: account.mask,
          balanceCents: account.balanceCents,
          accountId: null,
          cardId: null,
          isSkipped: false,
        })),
      };
      const isLogoShared =
        institution !== null &&
        (await learnInstitutionLogo(
          firestore,
          [institution.name],
          institution.logo,
          now,
        ));
      const batch = firestore.batch();
      batch.create(
        firestore.doc(`${grantsPath(uid)}/${linkId}`),
        sealGrant(keyring, uid, linkId, grant, now),
      );
      batch.create(firestore.doc(itemIndexPath(grant.providerItemId)), {
        uid,
        linkId,
      } satisfies ItemIndexDoc);
      batch.create(firestore.doc(planDocPath(uid, 'links', linkId)), {
        id: linkId,
        status: 'active',
        lastSyncAt: null,
        createdAt: now,
        needsCardConsent: null,
        logoShared: isLogoShared ? true : null,
        cardDetails: null,
        sealed: sealWithKey(planKey, { ...linkSealed }, SEALED_SCHEMA_VERSION),
      });
      await batch.commit();

      await discardSupersededLinks(firestore, keyring, planKey.key, uid, {
        linkId,
        institutionName,
        createdAt: now,
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
