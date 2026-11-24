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
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

const NOT_COMBINABLE =
  'These two sign-ins can no longer be combined. Nothing was changed.';
const NEEDS_SIGN_IN =
  'One of these links needs a new sign-in first, so nothing waiting at the bank is missed. Sign in again, then combine. Nothing was changed.';
const BANK_DOWN =
  'The bank isn\u2019t answering right now. Try again in a little while. Nothing was changed.';
const BUSY =
  'Your bank was sending new purchases just then. Try again in a moment. Nothing was changed.';

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

/** `{ linkId, otherLinkId }` → `{ keptLinkId, moved }`: two live sign-ins holding the same accounts at one bank become one; both catch up first, the other is revoked at the bank, purchases stay. */
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

    const linkRef = (id: string) =>
      firestore.doc(planDocPath(uid, 'links', id));
    const grantRef = (id: string) => firestore.doc(`${grantsPath(uid)}/${id}`);
    const ids = [linkId, otherLinkId];

    // The kept link's next sync reads from where it left off, so both catch up first: a charge only the other one has seen yet would otherwise arrive twice, or never.
    const catchUp = async () => {
      const results = await ids.reduce(
        (previous, id) =>
          previous.then(async (done) => [
            ...done,
            await syncRunwayLink(firestore, keyring, uid, id),
          ]),
        Promise.resolve([] as Awaited<ReturnType<typeof syncRunwayLink>>[]),
      );
      if (results.some((result) => result.state === 'needsAttention')) {
        throw new HttpsError('failed-precondition', NEEDS_SIGN_IN, {
          reason: 'needsSignIn',
        });
      }
      if (results.some((result) => result.state === 'failed')) {
        throw new HttpsError('unavailable', BANK_DOWN);
      }
      const grants = await Promise.all(ids.map((id) => grantRef(id).get()));
      return grants.map((grant) =>
        grant.exists ? ((grant.data()?.cursor as string | null) ?? null) : null,
      );
    };

    const combineOnce = (cursors: (string | null)[]) =>
      firestore.runTransaction(async (transaction) => {
        const snapshots = await transaction.getAll(
          ...ids.map(linkRef),
          ...ids.map(grantRef),
        );
        const grantSnapshots = snapshots.slice(ids.length);
        if (grantSnapshots.some((grant) => !grant.exists)) {
          throw new HttpsError('failed-precondition', NOT_COMBINABLE, {
            reason: 'notCombinable',
          });
        }
        // A sync that finished since the catch-up moved a cursor past charges the plan below has not seen.
        const isCaughtUp = grantSnapshots.every(
          (grant, index) =>
            ((grant.data()?.cursor as string | null) ?? null) ===
            cursors[index],
        );
        if (!isCaughtUp) return null;
        const links = snapshots
          .slice(0, ids.length)
          .flatMap((snapshot): LinkRead[] => {
            const data = snapshot.data();
            if (!snapshot.exists || !data || data.status === 'revoked')
              return [];
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
          throw new HttpsError('failed-precondition', NOT_COMBINABLE, {
            reason: 'notCombinable',
          });
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
          throw new HttpsError('failed-precondition', NOT_COMBINABLE, {
            reason: 'notCombinable',
          });
        }
        const { keep, drop, plan } = choice;
        const targetRefs = plan.moves.map((move) =>
          firestore.doc(planDocPath(uid, move.collection, move.targetId)),
        );
        const dropGrant = grantSnapshots[ids.indexOf(drop.id)];
        const targets =
          targetRefs.length === 0
            ? []
            : await transaction.getAll(...targetRefs);
        const isTargetHeld = targets.every(
          (target) => target.exists && target.data()?.linkId === drop.id,
        );
        if (!isTargetHeld) {
          throw new HttpsError('failed-precondition', NOT_COMBINABLE, {
            reason: 'notCombinable',
          });
        }

        const nextKeep: LinkSealed = {
          institutionName: keep.sealed.institutionName,
          institutionLogo:
            keep.sealed.institutionLogo ?? drop.sealed.institutionLogo ?? null,
          ...(keep.sealed.institutionDomain === undefined &&
          drop.sealed.institutionDomain === undefined
            ? {}
            : {
                institutionDomain:
                  keep.sealed.institutionDomain ??
                  drop.sealed.institutionDomain ??
                  null,
              }),
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
          transaction.delete(
            firestore.doc(itemIndexPath(grantDoc.providerItemId)),
          );
        }
        return {
          keptLinkId: keep.id,
          moved: plan.moves.length,
          grantDoc,
        };
      });

    const outcome = await [1, 2, 3].reduce<
      Promise<Awaited<ReturnType<typeof combineOnce>>>
    >(
      (previous) =>
        previous.then(async (done) =>
          done === null ? combineOnce(await catchUp()) : done,
        ),
      Promise.resolve(null),
    );
    if (outcome === null) {
      throw new HttpsError('aborted', BUSY);
    }

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
