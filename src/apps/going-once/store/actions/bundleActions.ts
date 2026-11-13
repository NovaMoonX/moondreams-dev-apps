import {
  doc,
  runTransaction,
  updateDoc,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { generateUuid } from '@/utils';
import { formatCentsShort } from '@/utils/moneyUtils';
import {
  FINISHED_SALE_STATUS,
  MAX_BUNDLE_NAME_LENGTH,
  MAX_BUNDLE_THINGS,
  MAX_STATUS_HISTORY,
  MIN_BUNDLE_THINGS,
} from '@apps/going-once/constants';
import {
  bundleRef,
  clearNext,
  describeConflict,
  FINISHED_MESSAGE,
  GENERIC_MESSAGE,
  getNext,
  isMoney,
  isUnavailable,
  OFFLINE_MESSAGE,
  readActorName,
  toItemUpdate,
  toStored,
  type StatusTransition,
} from '@apps/going-once/store/actions/statusActions';
import { toBundle } from '@apps/going-once/store/listeners/toBundle';
import { toItem } from '@apps/going-once/store/listeners/toItem';
import type {
  Bundle,
  BundleChange,
  BundleChangeKind,
  BundleStatus,
  Item,
  ItemStatus,
  PaymentMethod,
} from '@apps/going-once/types';
import {
  appendBundleChange,
  applyThingsBack,
  splitPaid,
} from '@apps/going-once/utils/bundles';
import { getItemName } from '@apps/going-once/utils/listing';

export type BundleDraft = {
  name: string;
  priceCents: number;
  itemIds: string[];
  bundleOnlyIds: string[];
};

export type BundleResult =
  { ok: true; id: string; at: number } | { ok: false; message: string };

export type BundleTransition =
  | {
      kind: 'MARK_PENDING';
      inquiryId: string | null;
      buyerName: string | null;
      pickupOn: number | null;
    }
  | { kind: 'BACK_TO_AVAILABLE' }
  | {
      kind: 'MARK_SOLD';
      priceCents: number;
      method: PaymentMethod | null;
      soldOn: number;
    }
  | { kind: 'CHANGE_PAID'; priceCents: number }
  | { kind: 'NOT_SOLD' };

const GONE_BUNDLE_MESSAGE = 'This bundle is no longer here.';
const GONE_THING_MESSAGE = 'A thing in this bundle is no longer here.';
const NOT_ACTIVE_MESSAGE =
  'This bundle is held or sold. Put it back to available to change it.';
const NAME_MESSAGE = `Give the bundle a name of up to ${MAX_BUNDLE_NAME_LENGTH} letters.`;
const COUNT_MESSAGE = `A bundle holds ${MIN_BUNDLE_THINGS} to ${MAX_BUNDLE_THINGS} things.`;
const PRICE_MESSAGE = "That price doesn't look right.";
const NOTHING_LEFT_MESSAGE = 'There is nothing left in this bundle to change.';
const SAME_PAID_MESSAGE = 'That is already what was paid.';
const BUNDLE_OFFLINE_MESSAGE = 'Changing a bundle needs a connection.';

const itemRef = (saleId: string, itemId: string) =>
  doc(db, 'apps', 'going-once', 'sales', saleId, 'items', itemId);

const readItems = (
  transaction: Transaction,
  saleId: string,
  ids: string[],
): Promise<(Item | null)[]> =>
  Promise.all(
    ids.map((id) =>
      transaction
        .get(itemRef(saleId, id))
        .then((found) =>
          found.exists() ? toItem(found.id, saleId, found.data()) : null,
        ),
    ),
  );

const getDraftProblem = (draft: BundleDraft): string | null => {
  const name = draft.name.trim();
  if (name === '' || name.length > MAX_BUNDLE_NAME_LENGTH) return NAME_MESSAGE;
  const count = new Set(draft.itemIds).size;
  if (
    count !== draft.itemIds.length ||
    count < MIN_BUNDLE_THINGS ||
    count > MAX_BUNDLE_THINGS
  )
    return COUNT_MESSAGE;
  return isMoney(draft.priceCents) ? null : PRICE_MESSAGE;
};

/** Why a thing can't be put into a bundle, in words, or `null`. */
const getJoinProblem = (item: Item | null, bundleId: string): string | null => {
  if (item === null) return GONE_THING_MESSAGE;
  const name = getItemName(item);
  if (item.isDraft) return `${name} isn't finished yet.`;
  if (item.status !== 'AVAILABLE') return `${name} isn't available.`;
  if (item.bundleId !== null && item.bundleId !== bundleId)
    return `${name} is already in another bundle.`;
  return null;
};

const toChange = (
  kind: BundleChangeKind,
  uid: string,
  at: number,
  fields: Partial<BundleChange> = {},
): BundleChange => ({
  kind,
  byUid: uid,
  at,
  itemId: null,
  itemStatus: null,
  priceCents: null,
  fromPriceCents: null,
  ...fields,
});

const toFailure = (error: unknown): BundleResult => ({
  ok: false,
  message: isUnavailable(error) ? BUNDLE_OFFLINE_MESSAGE : GENERIC_MESSAGE,
});

type Outcome = BundleResult | { ok: false; message: string };

/** Makes a bundle of things that are on offer and in no other bundle, writing each thing's link to it in the same transaction. */
export async function createBundle(
  saleId: string,
  uid: string,
  draft: BundleDraft,
): Promise<BundleResult> {
  const problem = getDraftProblem(draft);
  if (problem !== null) return { ok: false, message: problem };
  const id = generateUuid();
  try {
    return await runTransaction(db, async (transaction): Promise<Outcome> => {
      const items = await readItems(transaction, saleId, draft.itemIds);
      const refused = items
        .map((item) => getJoinProblem(item, id))
        .find((message) => message !== null);
      if (refused !== undefined && refused !== null)
        return { ok: false, message: refused };
      const now = Date.now();
      const bundle: Bundle = {
        id,
        saleId,
        name: draft.name.trim(),
        itemIds: draft.itemIds,
        priceCents: draft.priceCents,
        status: 'ACTIVE',
        dealItemIds: null,
        sale: null,
        keptAtGoneCount: null,
        history: [
          toChange('CREATE', uid, now, { priceCents: draft.priceCents }),
        ],
        createdBy: uid,
        createdAt: now,
        lastEditedAt: null,
        lastEditedBy: null,
      };
      transaction.set(bundleRef(saleId, id), bundle);
      draft.itemIds.forEach((itemId) =>
        transaction.update(itemRef(saleId, itemId), {
          bundleId: id,
          isBundleOnly: draft.bundleOnlyIds.includes(itemId),
          lastEditedAt: now,
          lastEditedBy: uid,
        }),
      );
      return { ok: true, id, at: now };
    });
  } catch (error) {
    return toFailure(error);
  }
}

/** Renames, reprices and changes the things of a bundle that is still on offer; existing things keep their order and new ones go last. */
export async function editBundle(
  saleId: string,
  bundleId: string,
  uid: string,
  draft: BundleDraft,
): Promise<BundleResult> {
  const problem = getDraftProblem(draft);
  if (problem !== null) return { ok: false, message: problem };
  try {
    return await runTransaction(db, async (transaction): Promise<Outcome> => {
      const snapshot = await transaction.get(bundleRef(saleId, bundleId));
      if (!snapshot.exists())
        return { ok: false, message: GONE_BUNDLE_MESSAGE };
      const bundle = toBundle(bundleId, saleId, snapshot.data());
      if (bundle.status !== 'ACTIVE')
        return { ok: false, message: NOT_ACTIVE_MESSAGE };
      const kept = bundle.itemIds.filter((id) => draft.itemIds.includes(id));
      const added = draft.itemIds.filter((id) => !bundle.itemIds.includes(id));
      const removed = bundle.itemIds.filter(
        (id) => !draft.itemIds.includes(id),
      );
      const nextIds = [...kept, ...added];
      if (nextIds.length < MIN_BUNDLE_THINGS)
        return { ok: false, message: COUNT_MESSAGE };
      const things = await readItems(transaction, saleId, [
        ...nextIds,
        ...removed,
      ]);
      const byId = Object.fromEntries(
        [...nextIds, ...removed].map((id, index) => [id, things[index]]),
      );
      const refused = added
        .map((id) => getJoinProblem(byId[id], bundleId))
        .find((message) => message !== null);
      if (refused !== undefined && refused !== null)
        return { ok: false, message: refused };
      const isOnly = (id: string) => draft.bundleOnlyIds.includes(id);
      const onlyChanged = kept.some(
        (id) => byId[id] !== null && byId[id].isBundleOnly !== isOnly(id),
      );
      const name = draft.name.trim();
      const isRenamed = name !== bundle.name;
      const isRepriced = draft.priceCents !== bundle.priceCents;
      const now = Date.now();
      const edits =
        isRenamed || onlyChanged || added.length > 0 || removed.length > 0
          ? [toChange('EDIT', uid, now)]
          : [];
      const pricing = isRepriced
        ? [
            toChange('SET_PRICE', uid, now, {
              priceCents: draft.priceCents,
              fromPriceCents: bundle.priceCents,
            }),
          ]
        : [];
      const changes = [...edits, ...pricing];
      if (changes.length === 0) return { ok: true, id: bundleId, at: now };
      transaction.update(bundleRef(saleId, bundleId), {
        name,
        itemIds: nextIds,
        priceCents: draft.priceCents,
        history: changes.reduce(
          (history, change) =>
            appendBundleChange(history, change, MAX_STATUS_HISTORY),
          bundle.history,
        ),
        lastEditedAt: now,
        lastEditedBy: uid,
      });
      added.forEach((id) =>
        transaction.update(itemRef(saleId, id), {
          bundleId,
          isBundleOnly: isOnly(id),
          lastEditedAt: now,
          lastEditedBy: uid,
        }),
      );
      kept
        .filter(
          (id) => byId[id] !== null && byId[id].isBundleOnly !== isOnly(id),
        )
        .forEach((id) =>
          transaction.update(itemRef(saleId, id), {
            isBundleOnly: isOnly(id),
            lastEditedAt: now,
            lastEditedBy: uid,
          }),
        );
      removed
        .filter((id) => byId[id] !== null)
        .forEach((id) =>
          transaction.update(itemRef(saleId, id), {
            bundleId: null,
            isBundleOnly: false,
            lastEditedAt: now,
            lastEditedBy: uid,
          }),
        );
      return { ok: true, id: bundleId, at: now };
    });
  } catch (error) {
    return toFailure(error);
  }
}

/** Deletes a bundle in any status and frees every thing in it; each keeps its own status, a hold or a sale included. */
export async function unbundle(
  saleId: string,
  bundleId: string,
  uid: string,
  expectedStatus: BundleStatus,
): Promise<BundleResult> {
  try {
    const outcome = await runTransaction(
      db,
      async (transaction): Promise<Outcome | { conflict: Bundle }> => {
        const snapshot = await transaction.get(bundleRef(saleId, bundleId));
        if (!snapshot.exists())
          return { ok: false, message: GONE_BUNDLE_MESSAGE };
        const bundle = toBundle(bundleId, saleId, snapshot.data());
        if (bundle.status !== expectedStatus) return { conflict: bundle };
        const things = await readItems(transaction, saleId, bundle.itemIds);
        const now = Date.now();
        transaction.delete(bundleRef(saleId, bundleId));
        things.forEach((thing) => {
          if (thing === null || thing.bundleId !== bundleId) return;
          transaction.update(itemRef(saleId, thing.id), {
            bundleId: null,
            isBundleOnly: false,
            lastEditedAt: now,
            lastEditedBy: uid,
          });
        });
        return { ok: true, id: bundleId, at: now };
      },
    );
    if (!('conflict' in outcome)) return outcome;
    const conflict = await describeBundleConflict(outcome.conflict, uid);
    return { ok: false, message: `${conflict} It stays a bundle.` };
  } catch (error) {
    return toFailure(error);
  }
}

/** Lowers an on-offer bundle's price to what its available things cost separately, read in the transaction; touches nothing else. */
export async function lowerBundleToSeparate(
  saleId: string,
  bundleId: string,
  uid: string,
): Promise<BundleResult> {
  try {
    return await runTransaction(db, async (transaction): Promise<Outcome> => {
      const snapshot = await transaction.get(bundleRef(saleId, bundleId));
      if (!snapshot.exists())
        return { ok: false, message: GONE_BUNDLE_MESSAGE };
      const bundle = toBundle(bundleId, saleId, snapshot.data());
      if (bundle.status !== 'ACTIVE')
        return { ok: false, message: NOT_ACTIVE_MESSAGE };
      const things = await readItems(transaction, saleId, bundle.itemIds);
      const separateCents = things.reduce(
        (total, item) =>
          item?.status === 'AVAILABLE'
            ? total + (item.askingPriceCents ?? 0)
            : total,
        0,
      );
      const now = Date.now();
      if (bundle.priceCents > separateCents)
        transaction.update(bundleRef(saleId, bundleId), {
          priceCents: separateCents,
          history: appendBundleChange(
            bundle.history,
            toChange('SET_PRICE', uid, now, {
              priceCents: separateCents,
              fromPriceCents: bundle.priceCents,
            }),
            MAX_STATUS_HISTORY,
          ),
          lastEditedAt: now,
          lastEditedBy: uid,
        });
      return { ok: true, id: bundleId, at: now };
    });
  } catch (error) {
    return toFailure(error);
  }
}

/** Remembers how many things had gone when the seller chose Keep the bundle; the write is queued offline. */
export function keepBundle(
  saleId: string,
  bundleId: string,
  uid: string,
  goneCount: number,
): Promise<void> {
  return updateDoc(bundleRef(saleId, bundleId), {
    keptAtGoneCount: goneCount,
    lastEditedAt: Date.now(),
    lastEditedBy: uid,
  });
}

const EXPECTED_BUNDLE: Record<BundleTransition['kind'], BundleStatus[]> = {
  MARK_PENDING: ['ACTIVE'],
  BACK_TO_AVAILABLE: ['PENDING'],
  MARK_SOLD: ['ACTIVE', 'PENDING'],
  CHANGE_PAID: ['SOLD'],
  NOT_SOLD: ['SOLD'],
};

/** The status each thing of the deal must be in for the change. */
const getExpectedThing = (
  transition: BundleTransition,
  bundle: Bundle,
): ItemStatus => {
  if (transition.kind === 'MARK_PENDING') return 'AVAILABLE';
  if (transition.kind === 'MARK_SOLD')
    return bundle.status === 'ACTIVE' ? 'AVAILABLE' : 'PENDING';
  if (transition.kind === 'BACK_TO_AVAILABLE') return 'PENDING';
  return 'SOLD';
};

const getThingTransition = (
  transition: BundleTransition,
  share: number,
): StatusTransition => {
  if (transition.kind === 'MARK_SOLD')
    return { ...transition, priceCents: share };
  if (transition.kind === 'CHANGE_PAID')
    return { ...transition, priceCents: share };
  return transition;
};

const CONFLICT_CAUSE: Record<BundleStatus, BundleChange['kind'] | null> = {
  ACTIVE: null,
  PENDING: 'MARK_PENDING',
  SOLD: 'MARK_SOLD',
};

const describeBundleConflict = async (bundle: Bundle, uid: string) => {
  const cause = CONFLICT_CAUSE[bundle.status];
  const who = await readActorName(
    bundle.history.filter((change) => change.kind === cause).at(-1)?.byUid ??
      null,
    uid,
  );
  if (bundle.status === 'SOLD')
    return `${who} already marked the ${bundle.name} bundle sold for ${formatCentsShort(bundle.sale?.priceCents ?? 0)}.`;
  if (bundle.status === 'PENDING')
    return `${who} already marked the ${bundle.name} bundle pending.`;
  return `${who} already put the ${bundle.name} bundle back to available.`;
};

const isValid = (transition: BundleTransition) => {
  if (transition.kind === 'MARK_SOLD')
    return isMoney(transition.priceCents) && Number.isFinite(transition.soldOn);
  if (transition.kind === 'CHANGE_PAID') return isMoney(transition.priceCents);
  if (transition.kind === 'MARK_PENDING')
    return transition.pickupOn === null || Number.isFinite(transition.pickupOn);
  return true;
};

/** The fields to write on the bundle for a change of its status, its history entry included. */
function toBundleUpdate(
  transition: BundleTransition,
  bundle: Bundle,
  dealIds: string[],
  uid: string,
  now: number,
) {
  const withHistory = (change: BundleChange) => ({
    lastEditedAt: now,
    lastEditedBy: uid,
    history: appendBundleChange(bundle.history, change, MAX_STATUS_HISTORY),
  });
  if (transition.kind === 'MARK_PENDING')
    return {
      ...withHistory(
        toChange('MARK_PENDING', uid, now, { priceCents: bundle.priceCents }),
      ),
      status: 'PENDING',
      dealItemIds: dealIds,
    };
  if (transition.kind === 'BACK_TO_AVAILABLE')
    return {
      ...withHistory(toChange('BACK_TO_AVAILABLE', uid, now)),
      status: 'ACTIVE',
      dealItemIds: null,
    };
  if (transition.kind === 'MARK_SOLD')
    return {
      ...withHistory(
        toChange('MARK_SOLD', uid, now, { priceCents: transition.priceCents }),
      ),
      status: 'SOLD',
      dealItemIds: dealIds,
      sale: {
        priceCents: transition.priceCents,
        method: transition.method,
        soldOn: transition.soldOn,
        markedBy: uid,
        markedAt: now,
      },
    };
  if (transition.kind === 'NOT_SOLD')
    return {
      ...withHistory(
        toChange('NOT_SOLD', uid, now, {
          fromPriceCents: bundle.sale?.priceCents ?? null,
        }),
      ),
      status: 'ACTIVE',
      dealItemIds: null,
      sale: null,
    };
  return {
    ...withHistory(
      toChange('CHANGE_PAID', uid, now, {
        priceCents: transition.priceCents,
        fromPriceCents: bundle.sale?.priceCents ?? null,
      }),
    ),
    sale: bundle.sale && { ...bundle.sale, priceCents: transition.priceCents },
  };
}

/**
 * Holds, sells or releases a whole bundle in one transaction that re-reads the sale, the bundle and every thing in its deal, so each thing gets the write its own status change would make.
 * It needs a connection on purpose, like a single thing's change.
 */
export async function changeBundleStatus(
  saleId: string,
  bundleId: string,
  uid: string,
  transition: BundleTransition,
): Promise<BundleResult> {
  if (!navigator.onLine) return { ok: false, message: OFFLINE_MESSAGE };
  if (!isValid(transition))
    return { ok: false, message: "That amount or day doesn't look right." };
  try {
    const outcome = await runTransaction(db, async (transaction) => {
      const bundleSnapshot = await transaction.get(bundleRef(saleId, bundleId));
      if (!bundleSnapshot.exists())
        return { kind: 'REFUSED', message: GONE_BUNDLE_MESSAGE } as const;
      const bundle = toBundle(bundleId, saleId, bundleSnapshot.data());
      const saleData = (
        await transaction.get(doc(db, 'apps', 'going-once', 'sales', saleId))
      ).data();
      const ids =
        bundle.status === 'ACTIVE'
          ? bundle.itemIds
          : (bundle.dealItemIds ?? []);
      const raw = await Promise.all(
        ids.map((id) => transaction.get(itemRef(saleId, id))),
      );
      const isReturning =
        transition.kind === 'BACK_TO_AVAILABLE' ||
        transition.kind === 'NOT_SOLD';
      const heldIds = bundle.dealItemIds ?? [];
      const outsideRaw =
        isReturning && bundle.status !== 'ACTIVE'
          ? await Promise.all(
              bundle.itemIds
                .filter((id) => !heldIds.includes(id))
                .map((id) => transaction.get(itemRef(saleId, id))),
            )
          : [];
      const isFinished = saleData?.status === FINISHED_SALE_STATUS;
      if (isFinished && transition.kind === 'MARK_PENDING')
        return { kind: 'REFUSED', message: FINISHED_MESSAGE } as const;
      if (!EXPECTED_BUNDLE[transition.kind].includes(bundle.status))
        return { kind: 'BUNDLE_CONFLICT', bundle } as const;
      const things = raw
        .filter((found) => found.exists())
        .map((found) => ({
          item: toItem(found.id, saleId, found.data()),
          stored: toStored(found.data()),
        }));
      const expected = getExpectedThing(transition, bundle);
      const deal =
        bundle.status === 'ACTIVE'
          ? things.filter(({ stored }) => stored.status === expected)
          : things;
      if (deal.length === 0 && !isReturning)
        return { kind: 'REFUSED', message: NOTHING_LEFT_MESSAGE } as const;
      const stale = deal.find(({ stored }) => stored.status !== expected);
      if (stale !== undefined) return { kind: 'CONFLICT', ...stale } as const;
      if (
        transition.kind === 'CHANGE_PAID' &&
        bundle.sale?.priceCents === transition.priceCents
      )
        return { kind: 'REFUSED', message: SAME_PAID_MESSAGE } as const;
      const now = Date.now();
      const isCleared = isFinished && saleData?.contactsClearedAt != null;
      const shares =
        transition.kind === 'MARK_SOLD' || transition.kind === 'CHANGE_PAID'
          ? splitPaid(
              transition.priceCents,
              deal.map(({ item }) => item.askingPriceCents ?? 0),
            )
          : deal.map(() => 0);
      const writes = deal.map(({ item, stored }, index) => ({
        id: item.id,
        stored,
        planned: getNext(
          stored,
          getThingTransition(transition, shares[index]),
          uid,
          now,
        ),
      }));
      const refused = writes.find(({ planned }) => typeof planned === 'string');
      if (
        refused !== undefined &&
        typeof refused.planned === 'string' &&
        transition.kind !== 'CHANGE_PAID'
      )
        return { kind: 'REFUSED', message: refused.planned } as const;
      writes.forEach(({ id, stored, planned }) => {
        if (typeof planned === 'string') return;
        transaction.update(
          itemRef(saleId, id),
          toItemUpdate(stored, clearNext(planned, isCleared), uid, now),
        );
      });
      const update = toBundleUpdate(
        transition,
        bundle,
        deal.map(({ item }) => item.id),
        uid,
        now,
      );
      const came = outsideRaw
        .filter((found) => found.exists())
        .map((found) => toItem(found.id, saleId, found.data()))
        .filter((item) => item.status === 'AVAILABLE');
      const back =
        came.length === 0
          ? {}
          : applyThingsBack(
              bundle,
              update.history,
              came,
              [...deal.map(({ item }) => item), ...came].reduce(
                (total, item) => total + (item.askingPriceCents ?? 0),
                0,
              ),
              uid,
              now,
              MAX_STATUS_HISTORY,
            );
      transaction.update(bundleRef(saleId, bundleId), { ...update, ...back });
      return { kind: 'DONE', at: now } as const;
    });
    if (outcome.kind === 'DONE')
      return { ok: true, id: bundleId, at: outcome.at };
    if (outcome.kind === 'REFUSED')
      return { ok: false, message: outcome.message };
    if (outcome.kind === 'BUNDLE_CONFLICT')
      return {
        ok: false,
        message: await describeBundleConflict(outcome.bundle, uid),
      };
    return {
      ok: false,
      message: await describeConflict(
        outcome.stored,
        uid,
        getItemName(outcome.item),
      ),
    };
  } catch (error) {
    return {
      ok: false,
      message: isUnavailable(error) ? OFFLINE_MESSAGE : GENERIC_MESSAGE,
    };
  }
}
