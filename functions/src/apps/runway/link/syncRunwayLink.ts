import {
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Timestamp,
  type Transaction,
  type WriteBatch,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { isGateOpenForUid } from '../../../gates/assertGateOpen.js';
import {
  openWithKey,
  sealWithKey,
  unwrapPlanKey,
  type Keyring,
  type SealedPayload,
} from '../planKey.js';
import {
  grantsPath,
  itemIndexPath,
  openGrant,
  type ItemIndexDoc,
  type ProviderGrantDoc,
} from './grant.js';
import {
  planDocPath,
  provider,
  SEALED_SCHEMA_VERSION,
  type LinkSealed,
} from './linkShared.js';
import { toBalanceSealed } from './normalize.js';
import { ProviderError, type ProviderGrant } from './provider.js';
import {
  applyTransactions,
  dedupeSubkey,
  getDirtyFrom,
  makeDedupeKey,
  neededDocIds,
  purchaseIdFor,
  targetsByProviderAccount,
  type PurchasePayload,
  type PurchaseState,
  type SyncOutcome,
  type Target,
} from './syncPlan.js';

const MAX_BATCH_WRITES = 450;
const MAX_ROUNDS = 20;
const READ_CHUNK = 300;

export type SyncState = 'ok' | 'needsAttention' | 'failed' | 'skipped';

export interface LinkSyncResult {
  linkId: string;
  state: SyncState;
  created: number;
  updated: number;
  removed: number;
}

type PlanKey = Awaited<ReturnType<typeof unwrapPlanKey>>;

const dayStart = (now: number) => Math.floor(now / 86_400_000) * 86_400_000;

const isSealed = (value: unknown): value is SealedPayload =>
  typeof value === 'object' && value !== null && 'value' in value;

function toState(
  docId: string,
  data: FirebaseFirestore.DocumentData,
  planKey: PlanKey,
): PurchaseState | null {
  try {
    if (!isSealed(data.sealed) || typeof data.dedupeKey !== 'string') {
      return null;
    }
    const payload = Object.fromEntries(
      Object.entries(openWithKey(planKey.key, data.sealed)).filter(
        ([name]) => name !== 'v',
      ),
    );
    const state: PurchaseState = {
      docId,
      dedupeKey: data.dedupeKey,
      date: data.date as number,
      status: data.status === 'pending' ? 'pending' : 'posted',
      needsHome: data.needsHome === true,
      accountId: (data.accountId as string | null) ?? null,
      expenseId: (data.expenseId as string | null) ?? null,
      payload: payload as PurchasePayload,
      isNew: false,
      isChanged: false,
    };
    return state;
  } catch {
    return null;
  }
}

async function readExisting(
  firestore: Firestore,
  uid: string,
  ids: readonly string[],
  planKey: PlanKey,
) {
  const chunks = Array.from(
    { length: Math.ceil(ids.length / READ_CHUNK) },
    (_, index) => ids.slice(index * READ_CHUNK, (index + 1) * READ_CHUNK),
  );
  const snapshots = (
    await Promise.all(
      chunks.map((chunk) =>
        firestore.getAll(
          ...chunk.map((id) =>
            firestore.doc(planDocPath(uid, 'purchases', id)),
          ),
        ),
      ),
    )
  ).flat();
  const unreadable = new Set<string>();
  const existing = new Map<string, PurchaseState>();
  const updateTimes = new Map<string, Timestamp>();
  snapshots.forEach((snapshot) => {
    if (!snapshot.exists) return;
    const state = toState(snapshot.id, snapshot.data() ?? {}, planKey);
    if (state) {
      existing.set(snapshot.id, state);
      if (snapshot.updateTime)
        updateTimes.set(snapshot.id, snapshot.updateTime);
    } else unreadable.add(snapshot.id);
  });
  return { existing, unreadable, updateTimes };
}

type Write =
  | { kind: 'set'; ref: DocumentReference; data: Record<string, unknown> }
  | {
      kind: 'update';
      ref: DocumentReference;
      data: Record<string, unknown>;
      lastUpdateTime: Timestamp | null;
    }
  | {
      kind: 'delete';
      ref: DocumentReference;
      lastUpdateTime: Timestamp | null;
    };

function toWrites(
  firestore: Firestore,
  uid: string,
  outcome: SyncOutcome,
  planKey: PlanKey,
  unreadable: ReadonlySet<string>,
  updateTimes: ReadonlyMap<string, Timestamp>,
  now: number,
): Write[] {
  return [...outcome.writes].flatMap(([docId, state]): Write[] => {
    if (unreadable.has(docId)) return [];
    const ref = firestore.doc(planDocPath(uid, 'purchases', docId));
    if (state === null) {
      return [
        { kind: 'delete', ref, lastUpdateTime: updateTimes.get(docId) ?? null },
      ];
    }
    const sealed = sealWithKey(
      planKey,
      { ...state.payload },
      SEALED_SCHEMA_VERSION,
    );
    return state.isNew
      ? [
          {
            kind: 'set',
            ref,
            data: {
              id: docId,
              date: state.date,
              source: 'link',
              status: state.status,
              needsHome: state.needsHome,
              accountId: state.accountId,
              expenseId: state.expenseId,
              dedupeKey: state.dedupeKey,
              createdAt: now,
              updatedAt: now,
              sealed,
            },
          },
        ]
      : [
          {
            kind: 'update',
            ref,
            lastUpdateTime: updateTimes.get(docId) ?? null,
            data: {
              date: state.date,
              status: state.status,
              updatedAt: now,
              sealed,
            },
          },
        ];
  });
}

const releasedPath = (uid: string, docId: string) =>
  planDocPath(uid, 'releasedCharges', docId);

/** A note for each placed pending charge the bank dropped, so the app can say where its money went back; the app deletes it once read. */
function toReleasedWrites(
  firestore: Firestore,
  uid: string,
  outcome: SyncOutcome,
  planKey: PlanKey,
  unreadable: ReadonlySet<string>,
  now: number,
): Write[] {
  return outcome.released
    .filter((charge) => !unreadable.has(charge.docId))
    .map((charge) => ({
      kind: 'set',
      ref: firestore.doc(releasedPath(uid, charge.docId)),
      data: {
        id: charge.docId,
        date: charge.date,
        createdAt: now,
        sealed: sealWithKey(
          planKey,
          {
            title: charge.title,
            amountCents: charge.amountCents,
            lines: charge.lines,
          },
          SEALED_SCHEMA_VERSION,
        ),
      },
    }));
}

/** Receipt photos follow a dropped pending charge to the posted one that took its place; each keeps the purchase id its bytes sit under. */
async function moveReceiptImages(
  firestore: Firestore,
  uid: string,
  takeovers: SyncOutcome['takeovers'],
) {
  const moves = await Promise.all(
    takeovers.map(async ({ from, to }) => {
      const found = await firestore
        .collection(`${planDocPath(uid, 'purchases', from)}/receiptImages`)
        .get();
      return found.docs.flatMap((entry): Write[] => [
        {
          kind: 'set',
          ref: firestore.doc(
            `${planDocPath(uid, 'purchases', to)}/receiptImages/${entry.id}`,
          ),
          data: entry.data(),
        },
        { kind: 'delete', ref: entry.ref, lastUpdateTime: null },
      ]);
    }),
  );
  await commitWrites(firestore, moves.flat());
}

async function commitWrites(firestore: Firestore, writes: readonly Write[]) {
  const groups = Array.from(
    { length: Math.ceil(writes.length / MAX_BATCH_WRITES) },
    (_, index) =>
      writes.slice(index * MAX_BATCH_WRITES, (index + 1) * MAX_BATCH_WRITES),
  );
  await groups.reduce(
    (previous, group) =>
      previous.then(async () => {
        const batch: WriteBatch = firestore.batch();
        group.forEach((write) => {
          if (write.kind === 'set') batch.set(write.ref, write.data);
          else if (write.kind === 'update') {
            if (write.lastUpdateTime) {
              batch.update(write.ref, write.data, {
                lastUpdateTime: write.lastUpdateTime,
              });
            } else batch.update(write.ref, write.data);
          } else if (write.lastUpdateTime) {
            batch.delete(write.ref, { lastUpdateTime: write.lastUpdateTime });
          } else batch.delete(write.ref);
        });
        await batch.commit();
      }),
    Promise.resolve(),
  );
}

/** A write into a month a closing may already hold marks the plan, as the app does, so that month is summed again. */
async function markClosedMonths(
  firestore: Firestore,
  uid: string,
  dates: readonly number[],
  now: number,
) {
  if (dates.length === 0) return;
  const ref = firestore.doc(`apps/runway/plans/${uid}`);
  await firestore.runTransaction(async (transaction) => {
    const plan = await transaction.get(ref);
    if (!plan.exists) return;
    const data = plan.data() ?? {};
    const dirtyFrom = getDirtyFrom(
      (data.dirtyFrom as string | null) ?? null,
      dates,
      dayStart(now),
    );
    if (dirtyFrom === null) return;
    transaction.update(ref, {
      dirtyFrom,
      updatedAt: Math.max(now, ((data.updatedAt as number) ?? 0) + 1),
    });
  });
}

async function syncPurchases(
  firestore: Firestore,
  uid: string,
  linkId: string,
  grant: ProviderGrant,
  planKey: PlanKey,
  targets: ReadonlyMap<string, Target>,
  grantRef: DocumentReference,
  startCursor: string | null,
) {
  const subkey = dedupeSubkey(planKey.key);
  const keys = new Map<string, string>();
  const keyOf = (providerTransactionId: string) => {
    const known = keys.get(providerTransactionId);
    if (known) return known;
    const made = makeDedupeKey(subkey, linkId, providerTransactionId);
    keys.set(providerTransactionId, made);
    return made;
  };

  const totals = {
    created: 0,
    updated: 0,
    removed: 0,
    dropped: 0,
    unreadable: 0,
  };
  const round = async (
    cursor: string | null,
    rounds: number,
  ): Promise<void> => {
    const page = await provider.syncTransactions(grant, cursor);
    const changed = [...page.added, ...page.modified];
    const { existing, unreadable, updateTimes } = await readExisting(
      firestore,
      uid,
      neededDocIds(keyOf, changed, page.removed),
      planKey,
    );
    const outcome = applyTransactions(
      keyOf,
      targets,
      page.added,
      page.modified,
      page.removed,
      existing,
    );
    const now = Date.now();
    await markClosedMonths(firestore, uid, outcome.touchedDates, now);
    await commitWrites(firestore, [
      ...toWrites(
        firestore,
        uid,
        outcome,
        planKey,
        unreadable,
        updateTimes,
        now,
      ),
      ...toReleasedWrites(firestore, uid, outcome, planKey, unreadable, now),
    ]);
    await moveReceiptImages(
      firestore,
      uid,
      outcome.takeovers.filter(({ from }) => !unreadable.has(from)),
    ).catch(() => {
      logger.warn('runway.sync.receiptsNotMoved', {
        linkId,
        count: outcome.takeovers.length,
      });
    });
    /* The batch can't share a transaction with the mark, so it marks again once the batch has landed:
       a closing rebuilt in between is refused by the plan's new stamp and built again. */
    await markClosedMonths(firestore, uid, outcome.touchedDates, Date.now());
    await grantRef.update({ cursor: page.nextCursor });
    totals.created += outcome.created;
    totals.updated += outcome.updated;
    totals.removed += outcome.removed;
    totals.dropped += outcome.dropped;
    totals.unreadable += unreadable.size;
    if (page.hasMore && rounds + 1 < MAX_ROUNDS) {
      await round(page.nextCursor, rounds + 1);
    }
  };
  await round(startCursor, 0);
  return totals;
}

/** Asks closer together than this reuse the last one: Plaid allows each Item 30 live balance reads an hour. */
const FRESH_GAP_MS = 2 * 60_000;

/** Claims this link's fresh ask, so two devices or a double tap ask the bank once; false when one ran too recently. */
const claimFreshAsk = (firestore: Firestore, grantRef: DocumentReference) =>
  firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(grantRef);
    const lastFreshAt: unknown = snapshot.data()?.lastFreshAt;
    const now = Date.now();
    if (typeof lastFreshAt === 'number' && now - lastFreshAt < FRESH_GAP_MS) {
      return false;
    }
    transaction.update(grantRef, { lastFreshAt: now });
    return true;
  });

/** A live read the bank answered with a sign-in request turns live reads off for this link and falls back to the saved balances. */
async function readAccounts(
  linkId: string,
  grant: ProviderGrant,
  grantRef: DocumentReference,
  isLive: boolean,
) {
  if (!isLive) {
    return { accounts: await provider.listAccounts(grant), isTurnedOff: false };
  }
  try {
    return {
      accounts: await provider.listAccounts(grant, { isLive: true }),
      isTurnedOff: false,
    };
  } catch (error) {
    if (!(error instanceof ProviderError) || error.code === 'NO_ACCOUNTS') {
      throw error;
    }
    // The purchases synced just before, so a sign-in request here came from the live read itself: it stays off for this link, a reconnect included.
    if (error.kind === 'needsAttention') {
      await grantRef.update({ isLiveBalanceOff: true }).catch(() => {
        logger.warn('runway.sync.liveOffWriteFailed', { linkId });
      });
    }
    logger.warn('runway.sync.liveBalanceFailed', {
      linkId,
      kind: error.kind,
      code: error.code,
      isTurnedOff: error.kind === 'needsAttention',
    });
    return {
      accounts: await provider.listAccounts(grant),
      isTurnedOff: error.kind === 'needsAttention',
    };
  }
}

async function writeBalances(
  firestore: Firestore,
  uid: string,
  linkId: string,
  grant: ProviderGrant,
  grantRef: DocumentReference,
  planKey: PlanKey,
  targets: ReadonlyMap<string, Target>,
  isAskingNow: boolean,
  wasLiveOff: boolean,
) {
  const { accounts, isTurnedOff } = await readAccounts(
    linkId,
    grant,
    grantRef,
    isAskingNow && !wasLiveOff,
  );
  const isLiveOff = wasLiveOff || isTurnedOff;
  const now = Date.now();
  const entries = accounts.flatMap((account) => {
    const target = targets.get(account.providerAccountId);
    const targetId = target?.accountId ?? target?.cardId ?? null;
    const read = toBalanceSealed(account);
    if (targetId === null || read === null) return [];
    // The app reads this as whether the balance gets the five-minute check, which stops for a link whose live reads are off.
    const sealed = {
      ...read,
      hasInstantBalance: read.hasInstantBalance && !isLiveOff,
    };
    // A saved balance with no date can't say how old it is, so it is left out rather than shown as new.
    if (account.balanceAsOf === null && !account.hasInstantBalance) return [];
    const asOf = Math.min(account.balanceAsOf ?? now, now);
    return [
      {
        ref: firestore.doc(planDocPath(uid, 'accountBalances', targetId)),
        targetId,
        asOf,
        sealed,
      },
    ];
  });
  if (entries.length === 0) return;
  // A saved read can be older than a live one made moments ago, and must never put an earlier balance back.
  await firestore.runTransaction(async (transaction) => {
    const stored = await transaction.getAll(
      ...entries.map((entry) => entry.ref),
    );
    const storedById = new Map(
      stored.map((snapshot) => [snapshot.id, snapshot.data()]),
    );
    entries.forEach((entry) => {
      const previous = storedById.get(entry.targetId);
      if (typeof previous?.asOf !== 'number' || previous.asOf <= entry.asOf) {
        transaction.set(entry.ref, {
          id: entry.targetId,
          asOf: entry.asOf,
          sealed: sealWithKey(planKey, entry.sealed, SEALED_SCHEMA_VERSION),
        });
        return;
      }
      // A newer live balance stays, but once live reads are off it must stop claiming the five-minute check.
      const kept = isLiveOff ? openStoredBalance(planKey, previous) : null;
      if (kept?.hasInstantBalance !== true) return;
      transaction.update(entry.ref, {
        sealed: sealWithKey(
          planKey,
          { ...kept, hasInstantBalance: false },
          SEALED_SCHEMA_VERSION,
        ),
      });
    });
  });
}

const STATEMENTS_GAP_MS = 12 * 3_600_000;
const STATEMENTS_UNSUPPORTED_GAP_MS = 7 * 86_400_000;

const areStatementsDue = (
  grantDoc: ProviderGrantDoc,
  isStatementsDue: boolean,
  now: number,
) => {
  if (isStatementsDue) return true;
  const checkedAt = grantDoc.statementsCheckedAt;
  if (typeof checkedAt !== 'number') return true;
  return (
    now - checkedAt >=
    (grantDoc.isStatementsUnsupported === true
      ? STATEMENTS_UNSUPPORTED_GAP_MS
      : STATEMENTS_GAP_MS)
  );
};

/** Keeps the readable `needsCardConsent` flag in step with the provider's answer, writing only on a change. */
async function setNeedsCardConsent(
  firestore: Firestore,
  linkRef: DocumentReference,
  value: boolean,
) {
  await writeUnlessRevoked(firestore, linkRef, (transaction) =>
    transaction.update(linkRef, { needsCardConsent: value }),
  );
}

async function writeCardStatements(
  firestore: Firestore,
  uid: string,
  linkId: string,
  grant: ProviderGrant,
  grantRef: DocumentReference,
  linkRef: DocumentReference,
  planKey: PlanKey,
  targets: ReadonlyMap<string, Target>,
  hadConsentFlag: boolean | null,
) {
  const read = await provider.listCardStatements(grant);
  if (read.kind === 'notReady') return;
  const now = Date.now();
  if (read.kind === 'needsConsent') {
    await grantRef.update({
      statementsCheckedAt: now,
      isStatementsUnsupported: false,
    });
    if (hadConsentFlag !== true) {
      await setNeedsCardConsent(firestore, linkRef, true);
    }
    return;
  }
  if (read.kind === 'unsupported') {
    await grantRef.update({
      statementsCheckedAt: now,
      isStatementsUnsupported: true,
    });
    return;
  }
  const writes = read.statements.flatMap((statement): Write[] => {
    const cardId = targets.get(statement.providerAccountId)?.cardId ?? null;
    if (cardId === null) return [];
    return [
      {
        kind: 'set',
        ref: firestore.doc(planDocPath(uid, 'cardStatements', cardId)),
        data: {
          id: cardId,
          asOf: now,
          sealed: sealWithKey(
            planKey,
            {
              minimumCents: statement.minimumCents,
              statementCents: statement.statementCents,
              statementOn: statement.statementOn,
              dueOn: statement.dueOn,
              lastPaymentCents: statement.lastPaymentCents,
              lastPaymentOn: statement.lastPaymentOn,
            },
            SEALED_SCHEMA_VERSION,
          ),
        },
      },
    ];
  });
  await commitWrites(firestore, writes);
  await grantRef.update({
    statementsCheckedAt: now,
    isStatementsUnsupported: false,
  });
  if (hadConsentFlag !== false) {
    await setNeedsCardConsent(firestore, linkRef, false);
  }
  logger.info('runway.sync.statementsWritten', {
    linkId,
    count: writes.length,
  });
}

function openStoredBalance(planKey: PlanKey, data: DocumentData) {
  try {
    return openWithKey(planKey.key, data.sealed as SealedPayload);
  } catch {
    return null;
  }
}

/* An unlink can land while a sync runs, so every write that marks the link live re-reads it in the
   same transaction and stands down once it reads revoked. */
async function writeUnlessRevoked(
  firestore: Firestore,
  linkRef: DocumentReference,
  write: (transaction: Transaction) => void,
): Promise<boolean> {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(linkRef);
    if (!snapshot.exists || snapshot.data()?.status === 'revoked') return false;
    write(transaction);
    return true;
  });
}

/** Seals the bank's logo into a link made before logos were kept; the next sync retries a miss. */
async function keepLogo(
  firestore: Firestore,
  linkRef: DocumentReference,
  grant: ProviderGrant,
  planKey: Awaited<ReturnType<typeof unwrapPlanKey>>,
) {
  const institution = await provider.getInstitution(grant);
  if (!institution) return;
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(linkRef);
    if (!snapshot.exists || snapshot.data()?.status === 'revoked') return;
    const link = openWithKey(
      planKey.key,
      snapshot.data()?.sealed as SealedPayload,
    ) as unknown as Partial<LinkSealed>;
    if (link.institutionLogo !== undefined) return;
    const nextLink: LinkSealed = {
      institutionName: link.institutionName ?? '',
      institutionLogo: institution.logo,
      providerAccounts: link.providerAccounts ?? [],
    };
    transaction.update(linkRef, {
      sealed: sealWithKey(planKey, { ...nextLink }, SEALED_SCHEMA_VERSION),
    });
  });
}

const DETAILS_HISTORY_DAYS = 90;

/**
 * Adds the merchant's logo and the bank's own name to purchases this link brought in before they were kept. Only
 * existing purchases missing one change, and only those fields; nothing is created. True once every page was written.
 */
async function fillTransactionDetails(
  firestore: Firestore,
  uid: string,
  linkId: string,
  grant: ProviderGrant,
  planKey: PlanKey,
) {
  const now = Date.now();
  const toDay = (at: number) => new Date(at).toISOString().slice(0, 10);
  const details = await provider.listTransactionDetails(
    grant,
    toDay(now - DETAILS_HISTORY_DAYS * 86_400_000),
    toDay(now),
  );
  const subkey = dedupeSubkey(planKey.key);
  const idOf = (providerTransactionId: string) =>
    purchaseIdFor(makeDedupeKey(subkey, linkId, providerTransactionId));
  const byId = new Map(
    details.flatMap((entry) =>
      [
        entry.providerTransactionId,
        ...(entry.pendingTransactionId === null
          ? []
          : [entry.pendingTransactionId]),
      ].map((id) => [idOf(id), entry] as const),
    ),
  );
  const { existing, updateTimes } = await readExisting(
    firestore,
    uid,
    [...byId.keys()],
    planKey,
  );
  const writes = [...existing].flatMap(([docId, state]): Write[] => {
    const entry = byId.get(docId);
    if (!entry) return [];
    const merchantLogo = state.payload.merchantLogo || entry.merchantLogo;
    const bankName = state.payload.bankName || entry.bankName;
    if (
      merchantLogo === (state.payload.merchantLogo ?? null) &&
      bankName === (state.payload.bankName ?? null)
    ) {
      return [];
    }
    return [
      {
        kind: 'update',
        ref: firestore.doc(planDocPath(uid, 'purchases', docId)),
        lastUpdateTime: updateTimes.get(docId) ?? null,
        data: {
          sealed: sealWithKey(
            planKey,
            { ...state.payload, merchantLogo, bankName },
            SEALED_SCHEMA_VERSION,
          ),
        },
      },
    ];
  });
  await commitWrites(firestore, writes);
  logger.info('runway.sync.detailsFilled', { linkId, filled: writes.length });
  return true;
}

/**
 * Brings one link's new bank transactions in as purchases waiting in Needs a home, then refreshes the balances and the
 * sync time, and, for a link with a card, that card's statement (at most twice a day unless asked). One document per bank transaction (its id comes from the dedupe key), so a repeat changes nothing. Logs
 * counts and the link id only.
 */
export async function syncRunwayLink(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  linkId: string,
  options: { isFresh: boolean; isStatementsDue?: boolean } = {
    isFresh: false,
  },
): Promise<LinkSyncResult> {
  const empty = { linkId, created: 0, updated: 0, removed: 0 };
  const grantRef = firestore.doc(`${grantsPath(uid)}/${linkId}`);
  const linkRef = firestore.doc(planDocPath(uid, 'links', linkId));
  const [grantSnapshot, linkSnapshot] = await Promise.all([
    grantRef.get(),
    linkRef.get(),
  ]);
  if (
    !grantSnapshot.exists ||
    !linkSnapshot.exists ||
    linkSnapshot.data()?.status === 'revoked'
  ) {
    return { ...empty, state: 'skipped' };
  }
  if (!(await isGateOpenForUid(uid, 'runway', 'link-banks', 'off'))) {
    return { ...empty, state: 'skipped' };
  }

  try {
    const grantDoc = grantSnapshot.data() as ProviderGrantDoc;
    const index: ItemIndexDoc = { uid, linkId };
    const indexRef = firestore.doc(itemIndexPath(grantDoc.providerItemId));
    const isStillLinked = await writeUnlessRevoked(
      firestore,
      linkRef,
      (transaction) => transaction.set(indexRef, index),
    );
    if (!isStillLinked) return { ...empty, state: 'skipped' };
    const grant = openGrant(keyring, uid, grantDoc);
    const planKey = await unwrapPlanKey(firestore, keyring, uid);
    const link = openWithKey(
      planKey.key,
      linkSnapshot.data()?.sealed as SealedPayload,
    ) as unknown as LinkSealed;
    // Before the bank is asked for anything, so a bank that is down or needs a new sign-in still gets its logo.
    if (link.institutionLogo === undefined) {
      await keepLogo(firestore, linkRef, grant, planKey).catch(() => {
        logger.warn('runway.sync.logoFailed', { linkId });
      });
    }
    const targets = targetsByProviderAccount(link.providerAccounts);
    if (targets.size === 0) return { ...empty, state: 'skipped' };

    const isAskingNow =
      options.isFresh &&
      linkSnapshot.data()?.status === 'active' &&
      (await claimFreshAsk(firestore, grantRef));
    // Plaid checks the bank on its own a few times a day; this asks it to check now, and what it finds arrives through the webhook.
    if (isAskingNow) {
      await provider.refreshTransactions(grant).catch((error: unknown) => {
        logger.warn('runway.sync.refreshFailed', {
          linkId,
          kind: error instanceof ProviderError ? error.kind : 'internal',
          code: error instanceof ProviderError ? error.code : null,
        });
      });
    }

    const totals = await syncPurchases(
      firestore,
      uid,
      linkId,
      grant,
      planKey,
      targets,
      grantRef,
      grantDoc.cursor ?? null,
    );
    // The purchases just came through, so a failed balance read sends the person to reconnect only when the bank shares no accounts at all.
    await writeBalances(
      firestore,
      uid,
      linkId,
      grant,
      grantRef,
      planKey,
      targets,
      isAskingNow,
      grantDoc.isLiveBalanceOff === true,
    ).catch((error: unknown) => {
      if (error instanceof ProviderError && error.code === 'NO_ACCOUNTS') {
        throw error;
      }
      logger.warn('runway.sync.balancesFailed', {
        linkId,
        kind: error instanceof ProviderError ? error.kind : 'internal',
        code: error instanceof ProviderError ? error.code : null,
      });
    });
    const hasCardTarget = [...targets.values()].some(
      (target) => target.cardId !== null,
    );
    if (
      hasCardTarget &&
      areStatementsDue(grantDoc, options.isStatementsDue === true, Date.now())
    ) {
      const consentFlag: unknown = linkSnapshot.data()?.needsCardConsent;
      await writeCardStatements(
        firestore,
        uid,
        linkId,
        grant,
        grantRef,
        linkRef,
        planKey,
        targets,
        typeof consentFlag === 'boolean' ? consentFlag : null,
      ).catch((error: unknown) => {
        logger.warn('runway.sync.statementsFailed', {
          linkId,
          kind: error instanceof ProviderError ? error.kind : 'internal',
          code: error instanceof ProviderError ? error.code : null,
        });
      });
    }
    const wereDetailsFilled =
      typeof linkSnapshot.data()?.detailsFilledAt === 'number';
    const detailsFilledNow =
      !wereDetailsFilled &&
      (await fillTransactionDetails(
        firestore,
        uid,
        linkId,
        grant,
        planKey,
      ).catch(() => {
        logger.warn('runway.sync.detailsFillFailed', { linkId });
        return false;
      }));
    await writeUnlessRevoked(firestore, linkRef, (transaction) =>
      transaction.update(linkRef, {
        lastSyncAt: Date.now(),
        status: 'active',
        ...(detailsFilledNow ? { detailsFilledAt: Date.now() } : {}),
      }),
    );
    logger.info('runway.sync.done', {
      linkId,
      created: totals.created,
      updated: totals.updated,
      removed: totals.removed,
      dropped: totals.dropped,
      unreadable: totals.unreadable,
    });
    return {
      ...empty,
      state: 'ok',
      created: totals.created,
      updated: totals.updated,
      removed: totals.removed,
    };
  } catch (error) {
    if (error instanceof ProviderError && error.kind === 'needsAttention') {
      const syncedAtStart: unknown = linkSnapshot.data()?.lastSyncAt ?? null;
      const isMarked = await firestore
        .runTransaction(async (transaction) => {
          const snapshot = await transaction.get(linkRef);
          const data = snapshot.data();
          // A sync that finished after this one started already proved the bank works, so its answer stands.
          if (
            !snapshot.exists ||
            data?.status === 'revoked' ||
            (data?.lastSyncAt ?? null) !== syncedAtStart
          ) {
            return false;
          }
          transaction.update(linkRef, { status: 'needsAttention' });
          return true;
        })
        .catch(() => false);
      logger.warn('runway.sync.needsAttention', {
        linkId,
        code: error.code,
        isMarked,
      });
      return { ...empty, state: 'needsAttention' };
    }
    logger.error('runway.sync.failed', {
      linkId,
      kind: error instanceof ProviderError ? error.kind : 'internal',
      code: error instanceof ProviderError ? error.code : null,
    });
    return { ...empty, state: 'failed' };
  }
}
