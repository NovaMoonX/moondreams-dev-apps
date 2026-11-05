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
  withProvider,
  type LinkSealed,
} from './link/linkShared.js';
import {
  openWithKey,
  sealWithKey,
  unwrapPlanKey,
  type SealedPayload,
} from './planKey.js';

if (getApps().length === 0) {
  initializeApp();
}

const MAX_CHOICES = 50;

interface Choice {
  providerAccountId: string;
  accountId: string | null;
  cardId: string | null;
}

const isId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value !== '' &&
  value !== '.' &&
  value !== '..' &&
  !value.includes('/');

const asNullableId = (value: unknown) => (value == null ? null : value);

function readChoices(raw: unknown): Choice[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_CHOICES) {
    throw new HttpsError('invalid-argument', 'Choose what to bring in first.');
  }
  const choices = raw.map((entry: Record<string, unknown> | null) => {
    const accountId = asNullableId(entry?.accountId);
    const cardId = asNullableId(entry?.cardId);
    const isValid =
      isId(entry?.providerAccountId) &&
      (accountId === null || isId(accountId)) &&
      (cardId === null || isId(cardId)) &&
      !(accountId !== null && cardId !== null);
    if (!isValid) {
      throw new HttpsError(
        'invalid-argument',
        'Each bank account goes to one account or one card.',
      );
    }
    const choice: Choice = {
      providerAccountId: entry?.providerAccountId as string,
      accountId: accountId as string | null,
      cardId: cardId as string | null,
    };
    return choice;
  });
  const targets = choices.flatMap((choice) =>
    [choice.accountId, choice.cardId].filter((id) => id !== null),
  );
  if (
    new Set(choices.map((choice) => choice.providerAccountId)).size !==
      choices.length ||
    new Set(targets).size !== targets.length
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Each bank account and each target can be chosen once.',
    );
  }
  return choices;
}

function openGrantOrFail(
  keyring: Parameters<typeof openGrant>[0],
  uid: string,
  linkId: string,
  doc: ProviderGrantDoc,
) {
  try {
    return openGrant(keyring, uid, doc);
  } catch {
    logger.error('runway.link.grantUnopened', { linkId });
    throw new HttpsError(
      'failed-precondition',
      'This bank link cannot be opened right now.',
    );
  }
}

const ALREADY_LINKED =
  'One of those accounts or cards is already linked, archived or gone. Pick again.';

/** `{ linkId, choices }` → `{ attached, balances }`: binds each bank account to one of the person's (or leaves it out) and stores the bank's balance, never applying it. */
export const attachRunwayAccounts = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 60,
    secrets: [...LINK_SECRETS, RUNWAY_MASTER_KEYS],
    cors: LINK_CORS,
  },
  async (request) => {
    const uid = await requireLinkCaller(request);
    const linkId: unknown = request.data?.linkId;
    if (!isId(linkId)) {
      throw new HttpsError('invalid-argument', 'That link is missing.');
    }
    const choices = readChoices(request.data?.choices);

    const keyring = loadKeyringOrFail();
    const firestore = getFirestore();
    const planKey = await unwrapPlanKey(firestore, keyring, uid).catch(() => {
      throw new HttpsError(
        'failed-precondition',
        'Open your plan once before linking a bank.',
      );
    });

    const grantSnapshot = await firestore
      .doc(`${grantsPath(uid)}/${linkId}`)
      .get();
    if (!grantSnapshot.exists) {
      throw new HttpsError('not-found', 'That bank link is not there anymore.');
    }
    const grant = openGrantOrFail(
      keyring,
      uid,
      linkId,
      grantSnapshot.data() as ProviderGrantDoc,
    );

    const live = await withProvider(() => provider.listAccounts(grant));
    const centsByProvider = new Map(
      live.map((account) => [account.providerAccountId, account.balanceCents]),
    );

    const linkRef = firestore.doc(planDocPath(uid, 'links', linkId));
    const targetRef = (collection: 'accounts' | 'cards', id: string) =>
      firestore.doc(planDocPath(uid, collection, id));

    const outcome = await firestore.runTransaction(async (transaction) => {
      const linkSnapshot = await transaction.get(linkRef);
      if (!linkSnapshot.exists || linkSnapshot.data()?.status === 'revoked') {
        throw new HttpsError(
          'failed-precondition',
          'That bank link is not active.',
        );
      }
      const link = openWithKey(
        planKey.key,
        linkSnapshot.data()?.sealed as SealedPayload,
      ) as unknown as LinkSealed & { v: number };

      const refs = choices.flatMap((choice) =>
        choice.accountId
          ? [targetRef('accounts', choice.accountId)]
          : choice.cardId
            ? [targetRef('cards', choice.cardId)]
            : [],
      );
      const snapshots =
        refs.length > 0 ? await transaction.getAll(...refs) : [];
      const isUsable = snapshots.every((snapshot) => {
        const data = snapshot.data();
        return (
          snapshot.exists &&
          data?.archivedAt == null &&
          (data?.linkId ?? null) === null
        );
      });
      if (!isUsable)
        throw new HttpsError('failed-precondition', ALREADY_LINKED);

      const known = new Map(
        link.providerAccounts.map((entry) => [entry.providerAccountId, entry]),
      );
      const isChoiceValid = choices.every((choice) => {
        const entry = known.get(choice.providerAccountId);
        return entry && entry.accountId === null && entry.cardId === null;
      });
      if (!isChoiceValid) {
        throw new HttpsError(
          'failed-precondition',
          'One of those bank accounts is not part of this link or is already attached.',
        );
      }

      const now = Date.now();
      const byProvider = new Map(
        choices.map((choice) => [choice.providerAccountId, choice]),
      );
      const nextLink: LinkSealed = {
        institutionName: link.institutionName,
        providerAccounts: link.providerAccounts.map((entry) => {
          const choice = byProvider.get(entry.providerAccountId);
          return choice
            ? {
                ...entry,
                accountId: choice.accountId,
                cardId: choice.cardId,
                isSkipped: choice.accountId === null && choice.cardId === null,
              }
            : entry;
        }),
      };
      transaction.update(linkRef, {
        sealed: sealWithKey(planKey, { ...nextLink }, SEALED_SCHEMA_VERSION),
      });

      const written = choices.flatMap((choice) => {
        const targetId = choice.accountId ?? choice.cardId;
        const cents = centsByProvider.get(choice.providerAccountId) ?? null;
        return targetId === null ? [] : [{ choice, targetId, cents }];
      });
      written.forEach(({ choice, targetId, cents }) => {
        transaction.update(
          choice.accountId
            ? targetRef('accounts', targetId)
            : targetRef('cards', targetId),
          { linkId },
        );
        if (cents !== null) {
          transaction.set(
            firestore.doc(planDocPath(uid, 'accountBalances', targetId)),
            {
              id: targetId,
              asOf: now,
              sealed: sealWithKey(planKey, { cents }, SEALED_SCHEMA_VERSION),
            },
          );
        }
      });
      return {
        attached: written.length,
        balances: written.flatMap(({ targetId, cents }) =>
          cents === null ? [] : [{ targetId, cents }],
        ),
      };
    });

    logger.info('runway.link.attached', { linkId, attached: outcome.attached });
    return outcome;
  },
);
