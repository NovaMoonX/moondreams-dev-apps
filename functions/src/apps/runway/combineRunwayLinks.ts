import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import {
  grantsPath,
  itemIndexPath,
  openGrant,
  type ProviderGrantDoc,
} from './link/grant.js';
import {
  LINK_CORS,
  LINK_SECRETS,
  loadKeyringOrFail,
  planDocPath,
  provider,
  requireLinkCaller,
  SEALED_SCHEMA_VERSION,
  type LinkSealed,
} from './link/linkShared.js';
import { syncRunwayLink } from './link/syncRunwayLink.js';
import { isTwinLink, planCombine } from './link/twinLinks.js';
import {
  openWithKey,
  sealWithKey,
  unwrapPlanKey,
  type SealedPayload,
} from './planKey.js';

if (getApps().length === 0) {
  initializeApp();
}

const isId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[A-Za-z0-9_-]{1,128}$/.test(value);

const NOT_COMBINABLE =
  'These two sign-ins can no longer be combined. Nothing was changed.';

interface LinkRead {
  id: string;
  status: string;
  createdAt: number;
  sealed: LinkSealed;
}

/** Which link stays: a working one before one that needs a sign-in, then the older one, whose purchases keep their place. */
const byKeepOrder = (a: LinkRead, b: LinkRead) =>
  Number(a.status !== 'active') - Number(b.status !== 'active') ||
  a.createdAt - b.createdAt;

/**
 * `{ linkId, otherLinkId }` → `{ keptLinkId, moved }`: two live sign-ins that hold the same accounts at one bank become one.
 * Both are synced first so nothing waiting is missed, then the kept one takes over every placed account and the other is
 * removed and revoked at the bank; purchases already brought in stay as they are.
 */
export const combineRunwayLinks = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 120,
    secrets: [...LINK_SECRETS, RUNWAY_MASTER_KEYS],
    cors: LINK_CORS,
  },
  async (request) => {
    const uid = await requireLinkCaller(request);
    const linkId: unknown = request.data?.linkId;
    const otherLinkId: unknown = request.data?.otherLinkId;
    if (!isId(linkId) || !isId(otherLinkId) || linkId === otherLinkId) {
      throw new HttpsError('invalid-argument', 'Those bank links are missing.');
    }

    const keyring = loadKeyringOrFail();
    const firestore = getFirestore();
    const planKey = await unwrapPlanKey(firestore, keyring, uid).catch(() => {
      throw new HttpsError(
        'failed-precondition',
        'Open your plan once before linking a bank.',
      );
    });

    // The kept link's next sync reads from where it left off, so both catch up first: a charge only the other one has seen yet would otherwise arrive twice.
    const ids = [linkId, otherLinkId];
    await ids.reduce(
      (previous, id) =>
        previous.then(() =>
          syncRunwayLink(firestore, keyring, uid, id).then(() => undefined),
        ),
      Promise.resolve(),
    );

    const linkRef = (id: string) =>
      firestore.doc(planDocPath(uid, 'links', id));
    const grantRef = (id: string) => firestore.doc(`${grantsPath(uid)}/${id}`);

    const outcome = await firestore.runTransaction(async (transaction) => {
      const snapshots = await transaction.getAll(...ids.map(linkRef));
      const links = snapshots.flatMap((snapshot): LinkRead[] => {
        const data = snapshot.data();
        if (!snapshot.exists || !data || data.status === 'revoked') return [];
        return [
          {
            id: snapshot.id,
            status: data.status as string,
            createdAt: data.createdAt as number,
            sealed: openWithKey(
              planKey.key,
              data.sealed as SealedPayload,
            ) as unknown as LinkSealed,
          },
        ];
      });
      if (
        links.length !== 2 ||
        !isTwinLink(
          links[0].sealed,
          links[1].sealed.institutionName,
          links[1].sealed.providerAccounts,
        )
      ) {
        throw new HttpsError('failed-precondition', NOT_COMBINABLE);
      }
      const ordered = [...links].sort(byKeepOrder);
      const choice = [ordered, [...ordered].reverse()]
        .map(([keep, drop]) => ({
          keep,
          drop,
          plan: planCombine(keep.sealed, drop.sealed),
        }))
        .find(({ plan }) => plan !== null);
      if (!choice || !choice.plan) {
        throw new HttpsError('failed-precondition', NOT_COMBINABLE);
      }
      const { keep, drop, plan } = choice;
      const targetRefs = plan.moves.map((move) =>
        firestore.doc(planDocPath(uid, move.collection, move.targetId)),
      );
      const [dropGrant, ...targets] = await transaction.getAll(
        grantRef(drop.id),
        ...targetRefs,
      );
      const isTargetHeld = targets.every(
        (target) => target.exists && target.data()?.linkId === drop.id,
      );
      if (!isTargetHeld) {
        throw new HttpsError('failed-precondition', NOT_COMBINABLE);
      }

      const nextKeep: LinkSealed = {
        institutionName: keep.sealed.institutionName,
        institutionLogo:
          keep.sealed.institutionLogo ?? drop.sealed.institutionLogo ?? null,
        ...(keep.sealed.institutionDomain === undefined
          ? {}
          : { institutionDomain: keep.sealed.institutionDomain }),
        ...(keep.sealed.institutionCheckedAt === undefined
          ? {}
          : { institutionCheckedAt: keep.sealed.institutionCheckedAt }),
        providerAccounts: plan.providerAccounts,
      };
      transaction.update(linkRef(keep.id), {
        sealed: sealWithKey(planKey, { ...nextKeep }, SEALED_SCHEMA_VERSION),
      });
      plan.moves.forEach((move, index) => {
        transaction.update(targetRefs[index], { linkId: keep.id });
        // A statement read through the other sign-in would read as this one's until the next read replaces it.
        if (move.collection === 'cards') {
          transaction.delete(
            firestore.doc(planDocPath(uid, 'cardStatements', move.targetId)),
          );
        }
      });
      if (plan.moves.some((move) => move.collection === 'cards')) {
        transaction.update(grantRef(keep.id), { statementsCheckedAt: null });
      }
      transaction.delete(linkRef(drop.id));
      transaction.delete(grantRef(drop.id));
      const grantDoc = dropGrant.exists
        ? (dropGrant.data() as ProviderGrantDoc)
        : null;
      if (grantDoc !== null) {
        transaction.delete(firestore.doc(itemIndexPath(grantDoc.providerItemId)));
      }
      return {
        keptLinkId: keep.id,
        moved: plan.moves.length,
        grantDoc,
      };
    });

    if (outcome.grantDoc !== null) {
      await provider
        .revoke(openGrant(keyring, uid, outcome.grantDoc))
        .catch(() => {
          logger.warn('runway.link.combineRevokeFailed');
        });
    }
    await syncRunwayLink(firestore, keyring, uid, outcome.keptLinkId).catch(
      () => {
        logger.warn('runway.link.combineSyncFailed');
      },
    );
    logger.info('runway.link.combined', {
      keptLinkId: outcome.keptLinkId,
      moved: outcome.moved,
    });
    const result = { keptLinkId: outcome.keptLinkId, moved: outcome.moved };
    return result;
  },
);
