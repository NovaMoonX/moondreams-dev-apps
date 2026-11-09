import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import {
  LINK_CORS,
  LINK_SECRETS,
  loadKeyringOrFail,
  requireLinkCaller,
} from './link/linkShared.js';
import { finishRevokedLinks } from './link/revokeGrant.js';
import { syncRunwayLink, type LinkSyncResult } from './link/syncRunwayLink.js';

if (getApps().length === 0) {
  initializeApp();
}

const STALE_AFTER_MS = 15 * 60_000;

const readStaleOnly = (data: unknown): boolean => {
  if (data === null || data === undefined) return false;
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'That request is not valid.');
  }
  const record = data as Record<string, unknown>;
  const { staleOnly } = record;
  if (
    Object.keys(record).some((key) => key !== 'staleOnly') ||
    (staleOnly !== undefined && typeof staleOnly !== 'boolean')
  ) {
    throw new HttpsError('invalid-argument', 'That request is not valid.');
  }
  return staleOnly === true;
};

/**
 * `{ staleOnly?: boolean }` → `{ results: [{ linkId, state, created, updated, removed }] }`: every active link of the caller and every one waiting on a sign-in (so one the bank let back in clears) (with `staleOnly`, only those not synced for 15 minutes), plus a retry of any revoke the bank refused. Safe to repeat.
 */
export const syncRunwayLinks = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 120,
    secrets: [...LINK_SECRETS, RUNWAY_MASTER_KEYS],
    cors: LINK_CORS,
  },
  async (request) => {
    const uid = await requireLinkCaller(request);
    const staleOnly = readStaleOnly(request.data);
    const keyring = loadKeyringOrFail();
    const firestore = getFirestore();
    const links = await firestore
      .collection(`apps/runway/plans/${uid}/links`)
      .where('status', 'in', ['active', 'needsAttention'])
      .get();
    const cutoff = Date.now() - STALE_AFTER_MS;
    const due = staleOnly
      ? links.docs.filter((link) => {
          const lastSyncAt: unknown = link.data().lastSyncAt;
          return typeof lastSyncAt !== 'number' || lastSyncAt < cutoff;
        })
      : links.docs;
    const [results] = await Promise.all([
      Promise.all(
        due.map((link) => syncRunwayLink(firestore, keyring, uid, link.id)),
      ) as Promise<LinkSyncResult[]>,
      finishRevokedLinks(firestore, keyring, uid).catch(() => {
        logger.warn('runway.link.revokeRetryFailed');
        return 0;
      }),
    ]);
    return { results };
  },
);
