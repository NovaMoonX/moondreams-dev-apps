import {
  type DocumentReference,
  type Firestore,
  type Timestamp,
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
import { ProviderError, type ProviderGrant } from './provider.js';
import {
  applyTransactions,
  dedupeSubkey,
  getDirtyFrom,
  makeDedupeKey,
  neededDocIds,
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
  | { kind: 'delete'; ref: DocumentReference };

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
    if (state === null) return [{ kind: 'delete', ref }];
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
              needsHome: true,
              accountId: state.accountId,
              expenseId: null,
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
    await commitWrites(
      firestore,
      toWrites(firestore, uid, outcome, planKey, unreadable, updateTimes, now),
    );
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

async function writeBalances(
  firestore: Firestore,
  uid: string,
  grant: ProviderGrant,
  planKey: PlanKey,
  targets: ReadonlyMap<string, Target>,
) {
  const accounts = await provider.listAccounts(grant);
  const now = Date.now();
  const writes = accounts.flatMap((account): Write[] => {
    const target = targets.get(account.providerAccountId);
    const targetId = target?.accountId ?? target?.cardId ?? null;
    if (targetId === null || account.balanceCents === null) return [];
    return [
      {
        kind: 'set',
        ref: firestore.doc(planDocPath(uid, 'accountBalances', targetId)),
        data: {
          id: targetId,
          asOf: now,
          sealed: sealWithKey(
            planKey,
            { cents: account.balanceCents },
            SEALED_SCHEMA_VERSION,
          ),
        },
      },
    ];
  });
  await commitWrites(firestore, writes);
}

/**
 * Brings one link's new bank transactions in as purchases waiting in Needs a home, then refreshes the balances and the
 * sync time. One document per bank transaction (its id comes from the dedupe key), so a repeat changes nothing. Logs
 * counts and the link id only.
 */
export async function syncRunwayLink(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  linkId: string,
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
    await firestore.doc(itemIndexPath(grantDoc.providerItemId)).set(index);
    const grant = openGrant(keyring, uid, grantDoc);
    const planKey = await unwrapPlanKey(firestore, keyring, uid);
    const link = openWithKey(
      planKey.key,
      linkSnapshot.data()?.sealed as SealedPayload,
    ) as unknown as LinkSealed;
    const targets = targetsByProviderAccount(link.providerAccounts);
    if (targets.size === 0) return { ...empty, state: 'skipped' };

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
    await writeBalances(firestore, uid, grant, planKey, targets).catch(
      (error: unknown) => {
        if (error instanceof ProviderError && error.kind === 'needsAttention') {
          throw error;
        }
        logger.warn('runway.sync.balancesFailed', { linkId });
      },
    );
    await linkRef.update({ lastSyncAt: Date.now(), status: 'active' });
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
      await linkRef.update({ status: 'needsAttention' });
      logger.warn('runway.sync.needsAttention', { linkId });
      return { ...empty, state: 'needsAttention' };
    }
    logger.error('runway.sync.failed', {
      linkId,
      kind: error instanceof ProviderError ? error.kind : 'internal',
    });
    return { ...empty, state: 'failed' };
  }
}
