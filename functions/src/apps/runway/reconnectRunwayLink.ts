import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import { grantsPath, openGrant, type ProviderGrantDoc } from './link/grant.js';
import {
  LINK_CORS,
  LINK_SECRETS,
  loadKeyringOrFail,
  planDocPath,
  provider,
  requireLinkCaller,
  SEALED_SCHEMA_VERSION,
  type LinkSealed,
  type ProviderAccountSealed,
} from './link/linkShared.js';
import { ProviderError, type ProviderGrant } from './link/provider.js';
import { remapAccounts } from './link/remapAccounts.js';
import { syncRunwayLink, type LinkSyncResult } from './link/syncRunwayLink.js';
import {
  openWithKey,
  sealWithKey,
  unwrapPlanKey,
  type SealedPayload,
} from './planKey.js';

if (getApps().length === 0) {
  initializeApp();
}

type ReconnectResult = LinkSyncResult & {
  newAccounts: number;
  added: ProviderAccountSealed[];
  stopped: number;
};

/** What the bank returns now; null when it could not be asked for a reason that should not stop the sync. */
async function listReturned(grant: ProviderGrant) {
  try {
    return await provider.listAccounts(grant);
  } catch (error) {
    if (error instanceof ProviderError && error.kind === 'needsAttention') {
      return 'needsAttention' as const;
    }
    logger.warn('runway.link.remapFailed', {
      code: error instanceof ProviderError ? error.code : null,
    });
    return null;
  }
}

/**
 * `{ linkId }` → `LinkSyncResult & { newAccounts, added, stopped }` (`added` is the new unbound accounts, `stopped` the bound ones the bank no longer shares): after the person signed in again at their bank, folds the accounts they picked into the link, sets their `needsAttention` link back to `active` and syncs it. A sync that still needs attention, or that is skipped, sets it back. Safe to repeat.
 */
export const reconnectRunwayLink = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 120,
    secrets: [...LINK_SECRETS, RUNWAY_MASTER_KEYS],
    cors: LINK_CORS,
  },
  async (request) => {
    const uid = await requireLinkCaller(request);
    const data = request.data as Record<string, unknown> | null;
    const linkId = data?.linkId;
    if (
      typeof data !== 'object' ||
      data === null ||
      Object.keys(data).some((key) => key !== 'linkId') ||
      typeof linkId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(linkId)
    ) {
      throw new HttpsError('invalid-argument', 'That link is not valid.');
    }
    const keyring = loadKeyringOrFail();
    const firestore = getFirestore();
    const linkRef = firestore.doc(planDocPath(uid, 'links', linkId));
    const grantRef = firestore.doc(`${grantsPath(uid)}/${linkId}`);
    const notWaiting = () =>
      new HttpsError(
        'failed-precondition',
        'That bank is not waiting for a reconnect.',
      );
    const [linkSnapshot, grantSnapshot] = await Promise.all([
      linkRef.get(),
      grantRef.get(),
    ]);
    const firstStatus = linkSnapshot.data()?.status;
    if (
      !grantSnapshot.exists ||
      (firstStatus !== 'needsAttention' && firstStatus !== 'active')
    ) {
      throw notWaiting();
    }

    const planKey = await unwrapPlanKey(firestore, keyring, uid);
    const listed = await listReturned(
      openGrant(keyring, uid, grantSnapshot.data() as ProviderGrantDoc),
    );
    if (listed === 'needsAttention') {
      const result: ReconnectResult = {
        linkId,
        state: 'needsAttention',
        created: 0,
        updated: 0,
        removed: 0,
        newAccounts: 0,
        added: [],
        stopped: 0,
      };
      return result;
    }

    const { newAccounts, added, stopped } = await firestore.runTransaction(
      async (transaction) => {
        const [link, grant] = await Promise.all([
          transaction.get(linkRef),
          transaction.get(grantRef),
        ]);
        const status = link.data()?.status;
        if (
          !grant.exists ||
          (status !== 'needsAttention' && status !== 'active')
        ) {
          throw notWaiting();
        }
        const sealed = openWithKey(
          planKey.key,
          link.data()?.sealed as SealedPayload,
        ) as unknown as LinkSealed;
        const remapped =
          listed === null
            ? null
            : remapAccounts(sealed.providerAccounts, listed);
        const hasChanged =
          remapped !== null &&
          JSON.stringify(remapped.providerAccounts) !==
            JSON.stringify(sealed.providerAccounts);
        if (status === 'needsAttention' || hasChanged) {
          transaction.update(linkRef, {
            status: 'active',
            ...(hasChanged
              ? {
                  sealed: sealWithKey(
                    planKey,
                    { ...sealed, providerAccounts: remapped.providerAccounts },
                    SEALED_SCHEMA_VERSION,
                  ),
                }
              : {}),
          });
        }
        return {
          newAccounts: remapped?.newAccounts ?? 0,
          added: remapped?.added ?? [],
          stopped: remapped?.stopped ?? 0,
        };
      },
    );
    logger.info('runway.link.reconnected');

    const result = await syncRunwayLink(firestore, keyring, uid, linkId, {
      isFresh: false,
      isStatementsDue: true,
    });
    if (result.state === 'skipped') {
      await firestore.runTransaction(async (transaction) => {
        const link = await transaction.get(linkRef);
        if (link.exists && link.data()?.status === 'active') {
          transaction.update(linkRef, { status: 'needsAttention' });
        }
      });
    }
    const reply: ReconnectResult = { ...result, newAccounts, added, stopped };
    return reply;
  },
);
